import { VerificationChallengeStore } from "./challenge-store.js";
export { VerificationChallengeStore };

// SMS delivery and verification-link issuance intentionally remain disabled
// until an SMS provider is selected and configured.
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  const headers=corsHeaders(request,env);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(url.pathname==="/health"&&request.method==="GET"){
   return json({ok:true,service:"diamond-lounge-phone-verification",status:"provider-not-configured",smsSendingEnabled:false,linkIssuanceEnabled:false},200,request,env);
  }
  if(url.pathname==="/status"&&request.method==="GET"){
   return json({ok:true,smsProvider:"none",smsSendingEnabled:false,linkIssuanceEnabled:false,challengeStore:"scaffold-only"},200,request,env);
  }
  return json({error:"Verification is disabled until an SMS provider is configured."},503,request,env);
 }
};
function corsHeaders(request,env){
 const origin=request.headers.get("Origin")||"";
 const allowed=(env.ALLOWED_ORIGINS||env.ALLOWED_ORIGIN||"").split(",").map(v=>v.trim()).filter(Boolean);
 return {"Access-Control-Allow-Origin":allowed.includes(origin)?origin:"null","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type,Authorization","Vary":"Origin","X-Content-Type-Options":"nosniff"};
}
function json(data,status,request,env){return new Response(JSON.stringify(data),{status,headers:{...corsHeaders(request,env),"Content-Type":"application/json"}});}
