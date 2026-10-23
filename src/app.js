const $ = id => document.getElementById(id);
async function readApiJson(response, label){try{return await response.json()}catch{throw Error(`${label}返回 ${response.status}，请稍后重试`)}}
const state = { active: false, listening: false, starting: false, busy: false, speaking: false, apiKeys: {}, envKeys: {}, ttsKeys: {}, ttsEnvKeys: {}, fishAudio: null, ttsAbort: null, stopAudio: null, voiceError: '', turns: [], tactics: new Set(), clues: new Set(), seconds: 0, timer: null, recognition: null, pending: '', pendingTimer: null, generation: 0 };
const selectedProvider = () => $('providerSelect').value;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let voiceChoices = [];
function populateVoices(){
  const select=$('voiceSelect');
  if(!('speechSynthesis' in window)){select.innerHTML='<option>浏览器不支持语音播报</option>';return}
  const previous=voiceChoices[Number(select.value)]?.voiceURI;
  const all=speechSynthesis.getVoices().filter(v=>/^zh[-_]cn$/i.test(v.lang));
  const male=/^(Eddy|Grandpa|Reed|Rocko)\b/i;
  voiceChoices=all.filter(v=>!male.test(v.name)).sort((a,b)=>{
    const rank=v=>{const n=v.name.toLowerCase();return n.startsWith('tingting')?0:n.startsWith('grandma')?1:n.startsWith('shelley')?2:n.startsWith('flo')?3:n.startsWith('sandy')?4:5};
    return rank(a)-rank(b)||Number(b.localService)-Number(a.localService)
  });
  select.innerHTML='';
  if(!voiceChoices.length){select.innerHTML='<option>未找到中文女声</option>';render();return}
  voiceChoices.forEach((v,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=`${v.name}${v.localService?' · 本机':''}`;select.append(option)});
  const remembered=voiceChoices.findIndex(v=>v.voiceURI===previous);
  select.value=String(remembered>=0?remembered:0);
  render();
}
function clock(n){return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`}
function status(s){$('callState').textContent=s;$('hint').textContent=s}
function render(){
  $('timer').textContent=clock(state.seconds);$('metricTime').textContent=clock(state.seconds);
  $('metricTurns').textContent=String(state.turns.filter(x=>x.role==='scammer').length).padStart(2,'0');
  $('callTag').textContent=state.active?'通话进行中':'等待接入';
  $('liveIndicator').textContent=state.active?'● LIVE':'● 未开始';$('liveIndicator').classList.toggle('on',state.active);
  $('startBtn').disabled=state.active;$('endBtn').disabled=!state.active;
  $('micBtn').disabled=!state.active||state.busy;$('textInput').disabled=!state.active||state.busy;$('sendBtn').disabled=!state.active||state.busy;
  const cloudMode=$('voiceModeSelect').value==='cloud';
  $('voiceModeSelect').disabled=state.active||state.speaking;
  $('voiceSelect').style.display=cloudMode?'none':'';
  $('voiceSelect').disabled=state.active||state.speaking;
  $('previewVoiceBtn').disabled=state.active||state.speaking||(!cloudMode&&!voiceChoices.length);
  $('micBtn').classList.toggle('on',state.listening);$('bars').classList.toggle('active',state.speaking);
  $('exportBtn').disabled=!state.turns.length;
  const list=$('transcript');list.innerHTML='';
  if(!state.turns.length){list.innerHTML='<div class="empty"><div class="empty-icon">☏</div><strong>等待第一句话</strong><p>点击“开始模拟来电”，再用麦克风说出诈骗话术。</p></div>'}
  for(const item of state.turns){const row=document.createElement('div');row.className=`message ${item.role}`;const who=document.createElement('span');who.className='who';who.textContent=item.role==='scammer'?'来电者':'王阿姨';const bubble=document.createElement('div');bubble.className='bubble';bubble.textContent=item.text;row.append(who,bubble);list.append(row)}
  list.scrollTop=list.scrollHeight;
  $('tactics').innerHTML='';if(!state.tactics.size)$('tactics').innerHTML='<span class="placeholder">来电者开口后显示</span>';else for(const t of state.tactics){const e=document.createElement('span');e.textContent=t;$('tactics').append(e)}
  $('clues').innerHTML='';if(!state.clues.size)$('clues').innerHTML='<span class="placeholder">尚无线索</span>';else for(const c of state.clues){const e=document.createElement('span');e.textContent=c;$('clues').append(e)}
}
function stopRecognition(){state.starting=false;state.listening=false;if(state.recognition){try{state.recognition.stop()}catch{}}render()}
const recognitionErrors={
  'not-allowed':'麦克风权限被拒绝。请在浏览器地址栏允许此网站使用麦克风，然后重试',
  'service-not-allowed':'浏览器不允许使用语音识别服务。请检查浏览器设置，或使用文字输入',
  'audio-capture':'浏览器没有收到麦克风声音。请检查系统麦克风和浏览器输入设备',
  'network':'浏览器语音识别服务连接失败。麦克风可能正常，但识别服务不可达；可换网络或暂用文字输入',
  'no-speech':'没有识别到说话声。请靠近麦克风，点击麦克风按钮重试',
  'language-not-supported':'浏览器不支持普通话语音识别。请换 Chrome 或使用文字输入'
};
function listen(){
  if(!state.active||state.busy||state.speaking||state.starting||state.listening||!SpeechRecognition)return;
  if(!state.recognition){
    const r=new SpeechRecognition();r.lang='zh-CN';r.continuous=true;r.interimResults=true;
    r.onresult=e=>{let interim='';for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0].transcript.trim();if(e.results[i].isFinal){state.pending+=t;clearTimeout(state.pendingTimer);state.pendingTimer=setTimeout(flushSpeech,850)}else interim+=t}$('interim').textContent=interim?'正在听：'+interim:''};
    r.onstart=()=>{state.starting=false;state.listening=true;status('正在听你说话…');render()};
    r.onerror=e=>{state.starting=false;state.listening=false;state.autoListen=false;status(recognitionErrors[e.error]||`语音识别失败（${e.error||'未知错误'}）。请点击麦克风重试或使用文字输入`);render()};
    r.onend=()=>{state.starting=false;state.listening=false;render();if(state.active&&!state.busy&&!state.speaking&&state.autoListen)setTimeout(listen,300)};
    state.recognition=r;
  }
  try{state.starting=true;state.autoListen=true;state.recognition.start();status('正在连接麦克风和语音识别…');render()}catch(error){state.starting=false;state.autoListen=false;status(`无法启动语音识别：${error.message}`);render()}
}
function flushSpeech(){const t=state.pending.trim();state.pending='';$('interim').textContent='';if(t)send(t)}
async function speakBrowser(text){
  if(!('speechSynthesis' in window))return false;
  if(!voiceChoices.length){populateVoices();if(!voiceChoices.length)await new Promise(resolve=>setTimeout(resolve,700))}
  const voice=voiceChoices[Number($('voiceSelect').value)];
  if(!voice)return false;
  return new Promise(resolve=>{
    speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(text.replace(/[…]+/g,'').replace(/\s+/g,' ').trim());
    u.lang='zh-CN';u.voice=voice;u.rate=1.04;u.pitch=1;
    state.speaking=true;render();let done=false;
    const finish=ok=>{if(done)return;done=true;clearTimeout(timeout);state.speaking=false;render();resolve(ok)};
    const timeout=setTimeout(()=>{speechSynthesis.cancel();finish(false)},22000);
    u.onend=()=>finish(true);u.onerror=()=>finish(false);
    speechSynthesis.speak(u)
  })
}
async function speakCloud(text){
  state.voiceError='';
  const provider=$('ttsProviderSelect').value;
  if(!state.ttsKeys[provider]&&!state.ttsEnvKeys[provider]){state.voiceError=`请先在页面顶部填写${provider==='fish'?' Fish Audio':'硅基流动'} API Key`;return false}
  const controller=new AbortController();state.ttsAbort=controller;state.speaking=true;render();
  let audioUrl='';
  try{
    const headers={'content-type':'application/json'};if(state.ttsKeys[provider])headers['x-tts-api-key']=state.ttsKeys[provider];
    const res=await fetch('/api/speech',{method:'POST',headers,body:JSON.stringify({text,provider,model:$('fishModelSelect').value,voice:$('siliconVoiceSelect').value}),signal:controller.signal});
    if(!res.ok){const data=await readApiJson(res,'语音服务');throw Error(data.error||`语音服务返回 ${res.status}`)}
    audioUrl=URL.createObjectURL(await res.blob());
    const audio=new Audio(audioUrl);state.fishAudio=audio;
    return await new Promise(resolve=>{
      let done=false;
      const finish=ok=>{if(done)return;done=true;resolve(ok)};
      state.stopAudio=()=>{audio.pause();finish(false)};
      audio.onended=()=>finish(true);
      audio.onerror=()=>{state.voiceError='音频播放失败';finish(false)};
      audio.play().catch(error=>{state.voiceError=`浏览器未能播放音频：${error.message}`;finish(false)})
    });
  }catch(error){state.voiceError=error.name==='AbortError'?'已停止播报':error.message;return false}
  finally{state.stopAudio=null;state.fishAudio=null;state.ttsAbort=null;state.speaking=false;if(audioUrl)URL.revokeObjectURL(audioUrl);render()}
}
const speak=text=>$('voiceModeSelect').value==='cloud'?speakCloud(text):speakBrowser(text);
function stopSpeech(){if('speechSynthesis' in window)speechSynthesis.cancel();state.ttsAbort?.abort();state.stopAudio?.();state.fishAudio?.pause();state.speaking=false;render()}
async function send(text){
  if(!state.active||state.busy||!text.trim())return;
  clearTimeout(state.pendingTimer);state.pending='';stopRecognition();state.busy=true;state.turns.push({role:'scammer',text:text.trim()});render();status('AI 正在思考如何接话…');const generation=state.generation;
  let failed=false;
  try{
    const provider=selectedProvider();const headers={'content-type':'application/json'};if(state.apiKeys[provider])headers['x-demo-api-key']=state.apiKeys[provider];
    const res=await fetch('/api/respond',{method:'POST',headers,body:JSON.stringify({provider,turns:state.turns})});const data=await readApiJson(res,'模型服务');
    if(!res.ok)throw Error(data.error||'请求失败');if(generation!==state.generation)return;
    $('keyStatus').textContent='✓ 模型连接成功';
    state.turns.push({role:'victim',text:data.reply});if(data.tactic)state.tactics.add(data.tactic);for(const c of data.clues||[])if(c)state.clues.add(c);$('stage').textContent=data.stage||'试探';render();status('王阿姨正在回答…');const voiced=await speak(data.reply);if(generation!==state.generation)return;if(!voiced){state.autoListen=false;status('回答已生成，但语音未能播报：'+(state.voiceError||'请切换音色后重试'))}else status('正在听你说话…');
  }catch(e){failed=true;if(generation===state.generation){$('keyStatus').textContent='连接失败';status('应答失败：'+e.message)}}finally{if(generation===state.generation){state.busy=false;if(failed)state.autoListen=false;render();if(state.active&&state.autoListen)listen()}}
}
$('startBtn').onclick=async()=>{const provider=selectedProvider();if(!state.apiKeys[provider]&&!state.envKeys[provider]){status(`请先在页面顶部填写${provider==='deepseek'?' DeepSeek':' OpenAI'} API Key`);$('apiKeyInput').focus();return}state.generation++;state.active=true;state.turns=[];state.tactics.clear();state.clues.clear();state.seconds=0;$('stage').textContent='等待对话';state.autoListen=true;clearInterval(state.timer);state.timer=setInterval(()=>{state.seconds++;render()},1000);render();if(SpeechRecognition)listen();else status('当前浏览器不支持语音识别，请使用下方文字输入')};
$('endBtn').onclick=()=>{state.generation++;state.active=false;state.autoListen=false;state.busy=false;clearInterval(state.timer);clearTimeout(state.pendingTimer);stopRecognition();stopSpeech();status('通话已结束，可导出记录或重新开始');render()};
$('micBtn').onclick=()=>{if(state.listening){state.autoListen=false;stopRecognition();status('收音已暂停，点击麦克风继续')}else listen()};
// Test the actual microphone signal locally; no recording or audio upload is involved.
$('micTestBtn').onclick=async()=>{
  if(state.active){state.autoListen=false;stopRecognition()}
  const result=$('micTestResult');const level=$('micLevel');const button=$('micTestBtn');
  button.disabled=true;level.style.width='0';result.textContent='请对着麦克风持续说话 5 秒…';
  let stream,context;
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw Error('当前浏览器不支持麦克风检测');
    stream=await navigator.mediaDevices.getUserMedia({audio:true});
    const deviceName=stream.getAudioTracks()[0]?.label||'未知输入设备';
    const AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextClass)throw Error('当前浏览器不支持音量检测');
    context=new AudioContextClass();await context.resume();
    const source=context.createMediaStreamSource(stream);const analyser=context.createAnalyser();analyser.fftSize=2048;source.connect(analyser);
    const samples=new Uint8Array(analyser.fftSize);let peak=0;const began=performance.now();
    await new Promise(resolve=>{const measure=()=>{
      analyser.getByteTimeDomainData(samples);
      let energy=0;for(const sample of samples){const v=(sample-128)/128;energy+=v*v}
      const volume=Math.sqrt(energy/samples.length);peak=Math.max(peak,volume);
      level.style.width=`${Math.min(100,Math.round(volume*1200))}%`;
      if(performance.now()-began<5000)requestAnimationFrame(measure);else resolve();
    };measure()});
    result.textContent=`当前输入：${deviceName}。`+(peak>=0.025
      ? '网页收到麦克风声音；若通话仍无文字，问题在浏览器语音识别'
      : '网页几乎没收到声音；请检查系统输入设备、音量和 Chrome 权限');
  }catch(error){result.textContent=`麦克风检测失败：${error.name==='NotAllowedError'?'请允许此网站使用麦克风':error.message}`}
  finally{stream?.getTracks().forEach(track=>track.stop());if(context)await context.close();button.disabled=false;level.style.width='0'}
};
$('sendBtn').onclick=()=>{const t=$('textInput').value.trim();$('textInput').value='';send(t)};
$('textInput').onkeydown=e=>{if(e.key==='Enter')$('sendBtn').click()};
$('exportBtn').onclick=()=>{const data={title:'模拟诈骗电话演示记录',date:new Date().toISOString(),duration:clock(state.seconds),turns:state.turns,tactics:[...state.tactics],clues:[...state.clues]};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download='模拟诈骗电话记录.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
function updateKeyStatus(){const provider=selectedProvider();const configured=Boolean(state.apiKeys[provider]||state.envKeys[provider]);$('keyStatus').textContent=state.apiKeys[provider]?'✓ 已填写，待验证':state.envKeys[provider]?'✓ 终端已配置':'尚未配置';$('keySetup').classList.toggle('configured',configured)}
function useKey(){const value=$('apiKeyInput').value.trim();if(!value){$('keyStatus').textContent='请先粘贴 Key';return}state.apiKeys[selectedProvider()]=value;$('apiKeyInput').value='';updateKeyStatus();status('Key 已填写，开始通话后会验证连接')}
$('keyBtn').onclick=useKey;
$('apiKeyInput').onkeydown=e=>{if(e.key==='Enter')useKey()};
$('providerSelect').onchange=()=>{if(state.active)$('endBtn').click();updateKeyStatus()};
$('voiceModeSelect').onchange=render;
function updateTtsStatus(){const provider=$('ttsProviderSelect').value;const configured=Boolean(state.ttsKeys[provider]||state.ttsEnvKeys[provider]);$('ttsStatus').textContent=state.ttsKeys[provider]?'✓ 已填写，待验证':state.ttsEnvKeys[provider]?'✓ 终端已配置':'尚未配置';$('ttsSetup').classList.toggle('configured',configured);$('ttsKeyInput').placeholder=`粘贴${provider==='fish'?' Fish Audio':'硅基流动'} API Key`;$('fishModelSelect').hidden=provider!=='fish';$('siliconVoiceSelect').hidden=provider!=='silicon';$('ttsHelp').innerHTML=provider==='fish'?'Fish Audio 负责语音。<a href="https://fish.audio/developers/" target="_blank" rel="noopener noreferrer">获取语音 Key ↗</a>':'硅基流动负责语音。<a href="https://cloud.siliconflow.cn/account/ak" target="_blank" rel="noopener noreferrer">获取语音 Key ↗</a>'}
function useTtsKey(){const value=$('ttsKeyInput').value.trim();if(!value){$('ttsStatus').textContent='请先粘贴语音 Key';return}state.ttsKeys[$('ttsProviderSelect').value]=value;$('ttsKeyInput').value='';updateTtsStatus();$('voiceModeSelect').value='cloud';render();status('已切换自然语音，请先点击“试听”')}
$('ttsProviderSelect').onchange=()=>{if(state.active)$('endBtn').click();updateTtsStatus()};
$('ttsKeyBtn').onclick=useTtsKey;
$('ttsKeyInput').onkeydown=e=>{if(e.key==='Enter')useTtsKey()};
$('previewVoiceBtn').onclick=async()=>{status('正在试听王阿姨的音色…');const voiced=await speak('哎，你说慢点儿，我年纪大了，没听太明白。');if($('voiceModeSelect').value==='cloud')$('ttsStatus').textContent=voiced?'✓ 语音连接成功':'语音连接失败';status(voiced?'试听结束，可以开始模拟来电':'试听失败：'+(state.voiceError||'请换一个音色试试'))};
if('speechSynthesis' in window){speechSynthesis.addEventListener('voiceschanged',populateVoices);populateVoices()}
fetch('/api/status').then(r=>r.json()).then(info=>{state.envKeys=info.ready||{};state.ttsEnvKeys=info.ttsReady||{};updateKeyStatus();updateTtsStatus()}).catch(()=>{});
updateTtsStatus();
render();
