(() => {
  const TOKYO = "Asia/Tokyo";
  const fmt = (date, options) => new Intl.DateTimeFormat("ja-JP", { timeZone: TOKYO, ...options }).format(date);
  const parts = (date) => Object.fromEntries(new Intl.DateTimeFormat("en-US", {timeZone:TOKYO,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date).filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
  const timeDate = (value, base) => { const p=parts(base); return new Date(Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(value.slice(0,2))-9,Number(value.slice(2)))); };
  const minutesAway=(date,now)=>Math.ceil((date-now)/60000);
  const fmtTime=(date)=>fmt(date,{hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
  const countdown=(mins)=>mins>=60 ? "あと"+Math.floor(mins/60)+"時間"+(mins%60)+"分" : "あと"+mins+"分";
  const safe=(s)=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function cards(routes, now, serviceDay) {
    return routes.map(route => {
      const next=(route.times[serviceDay]||[]).map(v=>({date:timeDate(v,now)})).filter(x=>x.date>now).slice(0,3);
      const schedule=next.length ? next.map((trip,i)=>'<div class="outbound-trip"><span>'+(i===0?"次の便":"次々便")+'</span><b>'+fmtTime(trip.date)+'発</b><strong>'+countdown(minutesAway(trip.date,now))+'</strong></div>').join("") : '<p class="outbound-empty">本日の次の便はありません。公式時刻表をご確認ください。</p>';
      return '<article class="outbound-route"><div class="outbound-route-title"><div><b>'+safe(route.origin)+' → '+safe(route.destination)+'</b><small>'+safe(route.line)+'・'+safe(route.direction)+'</small></div><span>院まで徒歩約'+route.finalWalkMinutes+'分</span></div>'+schedule+'<a class="official-outbound" href="'+safe(route.officialUrl)+'" target="_blank" rel="noreferrer">京成バス公式時刻表を確認 ↗</a></article>';
    }).join("");
  }
  async function init() {
    const now=new Date(), info=DolphinHoliday.serviceDayInfo(now), day=info.serviceDay;
    document.querySelector("#now").textContent="現在 "+fmt(now,{hour:"2-digit",minute:"2-digit",hourCycle:"h23"})+"（日本時間・"+(day||"要確認")+"）";
    const response=await fetch("data/outbound-timetables.json?v=20260731-outbound1",{cache:"force-cache"});
    if(!response.ok) throw new Error("時刻表を読み込めません");
    const data=await response.json(); if(!day) throw new Error(info.warning||"運行日を判定できません");
    document.querySelector("#kanamachiTimes").innerHTML=cards(data.routes.filter(r=>r.origin==="金町駅"),now,day);
    document.querySelector("#kameariTimes").innerHTML=cards(data.routes.filter(r=>r.origin==="亀有駅"),now,day);
  }
  init().catch(error=>{document.querySelector("#kanamachiTimes").innerHTML='<p class="outbound-empty">'+safe(error.message)+'。<a href="https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020004" target="_blank" rel="noreferrer">公式時刻表を開く ↗</a></p>';});
})();\n