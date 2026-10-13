(function(){
  const formatter = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
    timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric'
  });
  function parts(date){
    const out={};
    formatter.formatToParts(date).forEach(p=>{if(p.type==='year'||p.type==='month'||p.type==='day')out[p.type]=Number(p.value)});
    return {year:out.year,month:out.month,day:out.day};
  }
  function asciiDigits(value){
    return String(value).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  }
  function parse(value){
    const raw=asciiDigits(value).trim().replace(/[.-]/g,'/');
    const m=raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if(!m)return null;
    return {year:Number(m[1]),month:Number(m[2]),day:Number(m[3])};
  }
  function toGregorian(value){
    const j=typeof value==='string'?parse(value):value;
    if(!j||j.year<1200||j.year>1600||j.month<1||j.month>12||j.day<1||j.day>31)return null;
    const startYear=j.year+621;
    let newYear=null;
    for(let day=15;day<=25;day++){
      const candidate=new Date(Date.UTC(startYear,2,day));
      const p=parts(candidate);
      if(p.year===j.year&&p.month===1&&p.day===1){newYear=candidate;break;}
    }
    if(!newYear)return null;
    const ordinal=(j.month<=6?(j.month-1)*31:(j.month<=11?186+(j.month-7)*30:336))+j.day-1;
    const result=new Date(newYear.getTime()+ordinal*86400000);
    const check=parts(result);
    if(check.year!==j.year||check.month!==j.month||check.day!==j.day)return null;
    return result.getUTCFullYear()+'-'+String(result.getUTCMonth()+1).padStart(2,'0')+'-'+String(result.getUTCDate()).padStart(2,'0');
  }
  function fromGregorian(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return '';
    const [y,m,d]=value.split('-').map(Number);
    const p=parts(new Date(Date.UTC(y,m-1,d)));
    return String(p.year)+'/'+String(p.month).padStart(2,'0')+'/'+String(p.day).padStart(2,'0');
  }
  function today(){
    const now=new Date();
    return fromGregorian(now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0'));
  }
  window.JalaliDate={toGregorian,fromGregorian,today,parse};
})();