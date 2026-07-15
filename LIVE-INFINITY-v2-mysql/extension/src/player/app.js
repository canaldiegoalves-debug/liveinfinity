const p=new URLSearchParams(location.search);let files=[];try{files=JSON.parse(decodeURIComponent(p.get("files")||"[]"))}catch{}
const v=document.getElementById("video"),n=document.getElementById("name");let i=0;
function play(x){if(!files.length)return;i=(x+files.length)%files.length;v.src=files[i].url;n.textContent=files[i].name;v.play()}
v.onended=()=>play(i+1);next.onclick=()=>play(i+1);random.onclick=()=>play(Math.floor(Math.random()*files.length));play(0);
