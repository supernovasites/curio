export function maskPhone(value){
 let digits=String(value||'').replace(/\D/g,'');
 if(digits.startsWith('55')&&digits.length>11)digits=digits.slice(2);
 digits=digits.slice(0,11);
 if(!digits)return '';
 if(digits.length<3)return '('+digits+(digits.length===2?')':'');
 const number=digits.slice(2);
 return '('+digits.slice(0,2)+')'+number[0]+(number.length>1?'.'+number.slice(1,5):'')+(number.length>5?'-'+number.slice(5):'');
}
