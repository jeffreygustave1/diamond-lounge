// Challenge store primitive for a Durable Object. Not yet wired to public routes.
export class VerificationChallengeStore {
 constructor(state,env){this.state=state;this.env=env;}
 async fetch(request){
  if(request.method!=="POST")return new Response("Method not allowed",{status:405});
  const body=await request.json().catch(()=>null);
  if(!body||typeof body.action!=="string")return new Response("Bad request",{status:400});
  if(body.action==="put"){
   if(typeof body.key!=="string"||body.key.length<40||body.key.length>128||
      typeof body.uid!=="string"||body.uid.length>128||
      typeof body.phone!=="string"||body.phone.length>32||
      !Number.isSafeInteger(body.expiresAt)||body.expiresAt<=Date.now()||
      body.expiresAt>Date.now()+15*60*1000)return new Response("Bad request",{status:400});
   await this.state.storage.put(body.key,{uid:body.uid,phone:body.phone,expiresAt:body.expiresAt,createdAt:Date.now()});
   return new Response("stored",{status:201});
  }
  if(body.action==="consume"){
   if(typeof body.key!=="string")return new Response("Bad request",{status:400});
   // Durable Object storage transaction serializes the claim and delete.
   const entry=await this.state.storage.transaction(async txn=>{
    const value=await txn.get(body.key);
    if(!value||value.expiresAt<=Date.now()){
     if(value)await txn.delete(body.key);
     return null;
    }
    await txn.delete(body.key);
    return value;
   });
   if(!entry)return new Response("expired or invalid",{status:410});
   return Response.json(entry);
  }
  return new Response("Unknown action",{status:400});
 }
}
