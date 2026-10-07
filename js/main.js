/* sub4luv: phone walkthrough (step-by-step animation).
   Screenshots live in assets/img/. Step text and timings are in the ST array below (ms per step). */
const IM={c:'assets/img/channel-page.jpg',l:'assets/img/twitch-login.jpg',k:'assets/img/connect-amazon.jpg',s:'assets/img/subscribe-with-prime.jpg'};
const RM=matchMedia('(prefers-reduced-motion:reduce)').matches,$=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const ST=[['Open our link and press “Get a free sub”','Scroll down to the line with the Prime crown',6600],['Log in or sign up to Twitch','No account? Tap “Sign up”',4800],['Connect your Amazon','Tap Confirm. Any Prime account works',4800],['Revisit our page and tap “Subscribe with Prime”','Your 30-day countdown starts here. Repeat every month.',5400]];
const LY=[['c',2312/1179,null,1],['l',1.7659],['k',1795/1179,[.5,.431]],['s',1949/1179,[.72,.961]]],SH=100*17.5/9,VH=SH-17;
$('#steps').innerHTML=ST.map((s,i)=>`<li data-i="${i}" style="--d:${s[2]}ms"><span class="n">${i+1}</span><div><div class="t">${s[0]}</div><div class="s2wrap"><div class="s2">${s[1]}</div></div></div><i class="pbar"></i></li>`).join('');
$('#scr').innerHTML=LY.map(l=>{const ih=100*l[1],t=Math.min(0,VH-ih);return `<div class="sw"><img src="${IM[l[0]]}" alt="" style="--t1:${t}cqw">${l[2]?`<i class="tr" style="left:${l[2][0]*100}%;top:${l[2][1]*ih}cqw"></i>`:''}</div>`}).join('');
const lis=$$('#steps li'),sws=$$('#scr .sw'),vp=$('#vp'),pp=$('#pp'),pi=$('#pi');let cur=0,tm,playing=false;
function go(i){cur=i;clearTimeout(tm);lis.forEach((l,j)=>{l.classList.remove('act');if(j===i){void l.offsetWidth;l.classList.add('act')}});
 sws.forEach((s,j)=>{const on=j===i;if(on){const im=s.firstChild;im.style.transition='none';s.classList.remove('on','go');void im.offsetWidth;im.style.transition='';s.classList.add('on');if(LY[j][3])setTimeout(()=>{if(cur===j)s.classList.add('go')},1900)}else if(s.classList.contains('on')){s.classList.remove('on');setTimeout(()=>{if(cur!==j)s.classList.remove('go')},600)}});
 $('#pn').textContent=`Step ${i+1} of ${ST.length}`;
 if(playing)tm=setTimeout(()=>go((i+1)%ST.length),ST[i][2])}
function play(on){playing=on;vp.classList.toggle('paused',!on);pi.setAttribute('d',on?'M6 4h4v16H6zm8 0h4v16h-4z':'M7 4l13 8-13 8z');if(on)go(cur);else clearTimeout(tm)}
lis.forEach(l=>l.onclick=()=>{playing=true;vp.classList.remove('paused');pi.setAttribute('d','M6 4h4v16H6zm8 0h4v16h-4z');go(+l.dataset.i)});
pp.onclick=()=>play(!playing);
go(0);play(false);
new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting&&!RM&&!vp.dataset.u){play(true)}else if(!e.isIntersecting&&playing){play(false);vp.dataset.u=''}}),{threshold:.3}).observe($('.pane'));
pp.addEventListener('click',()=>{vp.dataset.u='1'});
