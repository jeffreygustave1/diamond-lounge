import { VerificationChallengeStore } from "./challenge-store.js";
export { VerificationChallengeStore };
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:corsHeaders(request,env)});
  if(url.pathname==="/health"&&request.method==="GET")return json({ok:true,status:"scaffold-only",smsConfigured:false},200,request,env);
  return json({error:"Phone verification service is not configured."},503,request,env);
 }
};
function corsHeaders(request,env){const origin=request.headers.get("Origin")||"",allowed=env.ALLOWED_ORIGIN||"";return {"Access-Control-Allow-Origin":origin===allowed?origin:"null","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type,Authorization","Vary":"Origin","X-Content-Type-Options":"nosniff"};}
function json(data,status,request,env){return new Response(JSON.stringify(data),{status,headers:{...corsHeaders(request,env),"Content-Type":"application/json"}});}
