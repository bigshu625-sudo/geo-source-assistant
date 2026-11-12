// Chrome counts failed capture attempts too. Space every attempt and recover
// from its two-calls-per-second quota without retrying permission failures.
export function createCaptureReader(capture,{now=Date.now,delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  let lastAttempt=-Infinity,queue=Promise.resolve();
  const history=[];
  return (windowId,options={format:'png'},verify)=>{
    const read=async()=>{
      for(let retry=0;;retry++){
        await delay(Math.max(0,600-(now()-lastAttempt)));
        let attempt;
        try{
          await verify?.();
          lastAttempt=now();
          attempt={at:lastAttempt};history.push(attempt);if(history.length>8)history.shift();
          const result=await capture(windowId,options);
          attempt.captured=true;
          await verify?.();
          return result;
        }
        catch(error){
          if(attempt)attempt.error=error.message;
          error.captureAttempts=history.map(item=>({...item}));
          if(!/MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND|capture.*quota/i.test(error.message)||retry>=2)throw error;
          await delay(1100);
        }
      }
    };
    const result=queue.then(read);queue=result.catch(()=>{});return result;
  };
}
