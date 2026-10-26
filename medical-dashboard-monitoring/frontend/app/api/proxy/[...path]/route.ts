import {NextRequest,NextResponse} from 'next/server';
export const dynamic = 'force-dynamic';
const backend=process.env.BACKEND_URL || 'http://127.0.0.1:8080';
async function forward(req:NextRequest,ctx:{params:Promise<{path:string[]}>}){
 const {path}=await ctx.params;
 const parts=path.map(encodeURIComponent).join('/');
 const url=`${backend}/api/v1/${parts}${req.nextUrl.search}`;
 const headers=new Headers();
 const cookie=req.headers.get('cookie');
 if(cookie) headers.set('cookie', cookie);
 const authorization=req.headers.get('authorization');
 if(authorization) headers.set('authorization', authorization);
 const csrf=req.headers.get('x-xsrf-token');
 if(csrf) headers.set('x-xsrf-token', csrf);
 const body=['GET','HEAD'].includes(req.method)?undefined:await req.arrayBuffer();
 if(body && req.headers.get('content-type'))headers.set('content-type',req.headers.get('content-type')!);
 try{
  const response=await fetch(url,{method:req.method,headers,body,cache:'no-store',redirect:'manual'});
  const outHeaders=new Headers(); const ct=response.headers.get('content-type');if(ct)outHeaders.set('content-type',ct);
  const setCookies = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() || [];
  if (setCookies.length) setCookies.forEach((cookie) => outHeaders.append('set-cookie', cookie));
  outHeaders.set('cache-control','no-store');
  return new NextResponse(await response.arrayBuffer(),{status:response.status,headers:outHeaders});
 }catch{return NextResponse.json({error:'Backend unavailable'}, {status:502})}
}
export {forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE};
