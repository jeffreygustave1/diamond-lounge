// Single-use challenge storage primitive; not wired to SMS or Firebase yet.
export class VerificationChallengeStore {
 constructor(state,env){this.state=state;this.env=env;}
 async fetch(request){
  if(request.method!=="POST")return new Response("Method not allowed",{status:405});
  const body=await request.json().catch(()=>null);
  if(!body||typeof body.action!=="string")return new Response("Bad request",{status:400});
  if(body.action==="put"){
   if(!body.key||!body.uid||!body.phone||!Number.isFinite(body.expiresAt))return new Response("Bad request",{status:400});
   await this.state.storage.put(body.key,{uid:body.uid,phone:body.phone,expiresAt:body.expiresAt,createdAt:Date.now()});
   return new Response("stored",{status:201});
  }
  if(body.action==="consume"){
   if(!body.key)return new Response("Bad request",{status:400});
   const entry=await this.state.storage.get(body.key);
   if(!entry||entry.expiresAt<Date.now()){if(entry)await this.state.storage.delete(body.key);return new Response("expired or invalid",{status:410});}
   await this.state.storage.delete(body.key);
   return Response.json(entry);
  }
  return new Response("Unknown action",{status:400});
 }
}
