// Núcleo del generador de terreno lunar: porte a JavaScript de MoonTerrain.java (alturas y túneles) y de la
// composición de columnas de MoonTerrainFeature. El workflow «Terreno» lo compara con el Java real en cada cambio.
// Alturas y túneles están verificados; regolito, rocas, guijarros y menas NO (las menas son aproximadas).
// ---------- núcleo: aritmética de 64 bits con pares de 32 bits ----------
let SH=0,SL=0,rh=0,rl=0;
function mul(ah,al,bh,bl){const a0=al&65535,a1=al>>>16,b0=bl&65535,b1=bl>>>16,p00=a0*b0,mid=a0*b1+a1*b0+(p00>>>16);
 rl=(((mid&65535)<<16)|(p00&65535))>>>0;rh=(a1*b1+Math.floor(mid/65536)+Math.imul(ah,bl)+Math.imul(al,bh))>>>0}
function mulI(i,bh,bl){mul(i<0?4294967295:0,i>>>0,bh,bl)}
function mix(h,l){let sh=h>>>30,sl=((l>>>30)|(h<<2))>>>0;h=(h^sh)>>>0;l=(l^sl)>>>0;
 mul(h,l,0xbf58476d,0x1ce4e5b9);h=rh;l=rl;sh=h>>>27;sl=((l>>>27)|(h<<5))>>>0;h=(h^sh)>>>0;l=(l^sl)>>>0;
 mul(h,l,0x94d049bb,0x133111eb);h=rh;l=rl;sh=h>>>31;sl=((l>>>31)|(h<<1))>>>0;rh=(h^sh)>>>0;rl=(l^sl)>>>0}
function add(h,l,bh,bl){const lo=l+bl;rh=(h+bh+(lo>=4294967296?1:0))>>>0;rl=lo>>>0}
function cellHash(s,x,z){mulI(s,0x632BE59B,0xD9B4E019);mix(rh,rl);const ah=rh,al=rl;
 mulI(x,0x9E3779B9,0x7F4A7C15);const xh=rh,xl=rl;mulI(z,0xC2B2AE3D,0x27D4EB4F);add(xh,xl,rh,rl);mix(rh,rl);
 rh=(SH^ah^rh)>>>0;rl=(SL^al^rl)>>>0;mix(rh,rl)}
function unit(h,l,c){if(c){mulI(c,0x9E3779B9,0x7F4A7C15);add(h,l,rh,rl);h=rh;l=rl}mix(h,l);return(rh*2097152+(rl>>>11))/9007199254740992}
const fd=(a,b)=>Math.floor(a/b),LC=new Map(),CC=new Map();
function lat(s,x,z){const k=(s*2097152+x+1048576)*2097152+z+1048576;let v=LC.get(k);if(v===undefined){cellHash(s,x,z);v=unit(rh,rl,0);LC.set(k,v)}return v}
const fade=t=>t*t*t*(t*(t*6-15)+10);
function noise(x,z,s){const x0=Math.floor(x),z0=Math.floor(z),fx=fade(x-x0),fz=fade(z-z0),a=lat(s,x0,z0),b=lat(s,x0+1,z0),c=lat(s,x0,z0+1),d=lat(s,x0+1,z0+1);
 const t=a+(b-a)*fx,u=c+(d-c)*fx;return(t+(u-t)*fz)*2-1}
function fbm(x,z,o,s){let sum=0,amp=1,nm=0;for(let i=0;i<o;i++){sum+=noise(x,z,s+i*31)*amp;nm+=amp;x*=2.03;z*=2.03;amp*=.5}return sum/nm}
function ridged(x,z,o,s){let sum=0,amp=1,nm=0;for(let i=0;i<o;i++){const n=1-Math.abs(noise(x,z,s+i*17));sum+=n*n*amp;nm+=amp;x*=2.1;z*=2.1;amp*=.5}return sum/nm}
const ss=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t)};
const mare=(x,z)=>ss(0,.22,-fbm(x/650,z/650,3,1));
const CELL=[20,44,96,208,448,960],CH=[.85,.7,.55,.45,.4,.35],TY=[30,43,38,38,19,8],AMP=[11,7,20,20,9,6],VS=[70,70,140,140,80,80],PL=[.05,.05,.2,.2,.05,.05],PH=[.32,.32,.47,.47,.32,.32],HB=[3,3,2.4,2.4,3,3],HV=[3.5,3.5,2.6,2.6,3.5,3.5],TW=[1,1,1,1,1.25,1.45];
function crater(lv,gx,gz){const k=(lv*2097152+gx+1048576)*2097152+gz+1048576;let c=CC.get(k);if(c!==undefined)return c;
 cellHash(100+lv,gx,gz);const h=rh,l=rl,cell=CELL[lv];
 if(unit(h,l,0)>CH[lv])c=null;else c={px:(gx+unit(h,l,1))*cell,pz:(gz+unit(h,l,2))*cell,r:cell*(.1+.12*unit(h,l,3)),age:unit(h,l,4),u5:unit(h,l,5),u6:unit(h,l,6)};
 CC.set(k,c);return c}
function profile(d,depth,rim,peak){let v=0;if(d<1)v-=depth*(1-d*d);const q=(d-1)/.17;v+=rim*Math.exp(-q*q);
 v+=.4*rim*Math.pow(Math.max(d,1),-3)*(1-ss(1.4,2.6,d));if(peak)v+=.5*depth*Math.exp(-(d/.13)*(d/.13));return v}
function craters(x,z,mr){let sum=0;for(let lv=0;lv<6;lv++){const cell=CELL[lv],cx=fd(x,cell),cz=fd(z,cell);
 for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){const c=crater(lv,cx+dx,cz+dz);if(!c)continue;
  const ddx=x-c.px,ddz=z-c.pz,dsq=ddx*ddx+ddz*ddz,reach=c.r*2.6;if(dsq>reach*reach)continue;
  const ang=Math.atan2(ddz,ddx),wob=1+.07*Math.sin(3*ang+c.u5*6.28)+.04*Math.sin(5*ang+c.u6*6.28),d=Math.sqrt(dsq)/(c.r*wob);
  const depth=Math.min(38,.3*c.r+.8)*(1-.55*c.age),rim=Math.min(24,.09*c.r+.4)*(1-.6*c.age),fl=lv>=2?1-.55*mr:1;
  sum+=profile(d,depth,rim,c.r>=30)*fl}}return sum}
function height(x,z){const m=mare(x,z),hl=1-m;let h=64;h+=fbm(x/900,z/900,3,2)*9-m*5;h+=fbm(x/70,z/70,4,3)*(2.5+7.5*hl);
 const ms=ridged(x/280,z/280,4,4);h+=Math.pow(Math.max(0,ms-.55)/.45,1.5)*60*hl;h+=(1-Math.abs(fbm(x/130,z/130,2,5)))*2.2*m;
 h+=craters(x,z,m);h+=fbm(x/9,z/9,2,6)*.9;return Math.max(8,Math.min(225,h))}
const axN=(x,z,lv)=>fbm(x/150,z/150,2,20+(lv>=4?200:0)+lv);
function axisRaw(x,z,lv,o){const so=lv>=4?200:0,sc=ss(PL[lv],PH[lv],fbm(x/210,z/210,2,40+so+lv));if(sc<=0)return false;
 const n=axN(x,z,lv),gx=axN(x+2,z,lv)-n,gz=axN(x,z+2,lv)-n,g=Math.sqrt(gx*gx+gz*gz)/2;if(g<.0015)return false;
 o[0]=Math.abs(n)/g;cellHash(50+so+lv,fd(x,160),fd(z,160));o[1]=(HB[lv]+HV[lv]*unit(rh,rl,0))*sc*TW[lv];
 o[2]=TY[lv]+fbm(x/VS[lv],z/VS[lv],lv==2||lv==3?2:1,60+so+lv)*AMP[lv];return true}
const PC=new Map(),NOP=null;
function portal(cx,cz){const k=cx*100003+cz;let p=PC.get(k);if(p!==undefined)return p;p=compPortal(cx,cz);PC.set(k,p);return p}
function compPortal(cx,cz){cellHash(400,cx,cz);const h=rh,l=rl;if(unit(h,l,0)>=.4)return NOP;
 const sx=(cx+.12+.76*unit(h,l,1))*224,sz=(cz+.12+.76*unit(h,l,2))*224,lv=Math.min(5,Math.floor(unit(h,l,3)*6));let px=sx,pz=sz;
 for(let i=0;i<10;i++){const n=axN(px,pz,lv),gx=(axN(px+2,pz,lv)-n)/2,gz=(axN(px,pz+2,lv)-n)/2,g2=gx*gx+gz*gz;if(g2<1e-9)return NOP;
  let ax=n*gx/g2,az=n*gz/g2;const len=Math.hypot(ax,az);if(len<.3)break;if(len>30){ax*=30/len;az*=30/len}px-=ax;pz-=az}
 if(Math.hypot(px-sx,pz-sz)>70)return NOP;const ix=Math.round(px),iz=Math.round(pz),t=[0,0,0];
 if(!axisRaw(ix,iz,lv,t)||t[1]<2.6||t[0]>t[1]*.6)return NOP;const surf=height(ix,iz),lift=Math.max(0,surf-11-2*unit(h,l,4)-t[2]);
 if(lift>45||surf-(t[2]+lift)<5)return NOP;const r0=t[1]+1.5+1.5*unit(h,l,5);
 return{x:ix,z:iz,level:lv,lift,cy:t[2]+lift,liftR:Math.max(50,lift*2.2),r0,rMax:r0+45}}
function near(x,z){const o=[],cx=fd(x,224),cz=fd(z,224);for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const p=portal(cx+a,cz+b);
 if(p&&Math.hypot(x-p.x,z-p.z)<Math.max(p.liftR,p.rMax))o.push(p)}return o}
function tubeAt(x,z,lv,o,nr){if(!axisRaw(x,z,lv,o))return false;
 for(const p of nr){if(p.level!==lv)continue;const d=Math.hypot(x-p.x,z-p.z);if(d<p.liftR){const q=ss(0,1,1-d/p.liftR);o[2]+=p.lift*q;o[1]*=1+.5*q}}
 return o[0]<o[1]&&o[1]>=1.2}
function tubes(x,z,R){let any=false;const t=[0,0,0],nr=near(x,z);
 for(let lv=0;lv<6;lv++){const T=R[lv];T.lo=1e9;T.hi=-1e9;if(!tubeAt(x,z,lv,t,nr))continue;const a=t[0]/t[1],rise=t[1]*.65*Math.sqrt(Math.max(0,1-a*a));if(rise<.8)continue;
  T.lo=Math.max(4,Math.ceil(t[2]-rise));T.hi=Math.floor(t[2]+rise);any=true}
 const S=R[6];S.lo=1e9;S.hi=-1e9;let best=1e300;
 for(const p of nr){let d=Math.hypot(x-p.x,z-p.z);if(d>p.rMax)continue;d+=fbm(x/20,z/20,1,412)*5.5+fbm(x/7,z/7,2,410)*1.8;const dd=Math.max(0,d-p.r0),
  rs=dd<=2.5?dd*3.5:2.5*3.5+(dd-2.5)*1.6;best=Math.min(best,p.cy-2+rs+fbm(x/4,z/4,1,411)*1.2)}
 if(best<160){S.lo=Math.max(4,Math.floor(best));S.hi=1000;any=true}return any}
function rnd(x,z,s){mul(SH,SL,0,31);add(rh,rl,x>>>0,z>>>0);const h=rh,l=rl;mulI(s,0x9E3779B9,0x7F4A7C15);add(h,l,rh,rl);mix(rh,rl);return unit(rh,rl,0)}
// ---------- generación del volumen (tipos: 1 bedrock 2 roca 3 regolito 4 basalto 5 ilmenita 6 hielo 7 helio-3 8 losa regolito 9 losa roca) ----------
let V,N,H;const I=(x,y,z)=>x+N*(z+N*y);
function carved(R,y,top){for(const t of R){if(t.hi===-1e9||y<4)continue;if(y>=t.lo&&y<=t.hi)return true;}return false}
function setSeed(seedStr){let b;try{b=BigInt(String(seedStr).trim()||0)}catch(e){b=0n;for(const ch of String(seedStr))b=b*31n+BigInt(ch.charCodeAt(0))}
 const u=BigInt.asUintN(64,b);SH=Number(u>>32n);SL=Number(u&0xffffffffn);LC.clear();CC.clear();PC.clear()}
function gen(seedStr,ox,oz,n){
 setSeed(seedStr);
 N=n;const W=N+2,hm=new Float64Array(W*W);let mx=0;
 for(let i=0;i<W;i++)for(let j=0;j<W;j++){const s=height(ox+i-1,oz+j-1);hm[i*W+j]=s;if(s>mx)mx=s}
 H=Math.ceil(mx)+7;V=new Uint8Array(N*N*H);const R=[{},{},{},{},{},{},{}],top=new Int32Array(256),slp=new Float64Array(256),open=new Uint8Array(256),hs=new Uint8Array(256),used=new Uint8Array(256);
 for(let cx=0;cx<N;cx+=16)for(let cz=0;cz<N;cz+=16){
  for(let lx=0;lx<16;lx++)for(let lz=0;lz<16;lz++){const X=cx+lx,Z=cz+lz,x=ox+X,z=oz+Z,i=X+1,j=Z+1,s=hm[i*W+j],full=Math.floor(s);let slab=s-full>=.5;const tp=full-1;
   const gx=(hm[(i+1)*W+j]-hm[(i-1)*W+j])/2,gz=(hm[i*W+j+1]-hm[i*W+j-1])/2,sl=Math.sqrt(gx*gx+gz*gz),k=lx*16+lz;slp[k]=sl;
   const mr=mare(x,z)>.5,rd=sl>.85?0:Math.max(1,Math.min(4,Math.round(3.4-sl*3.2+(rnd(x,z,0)-.5)*1.2)));
   const any=tubes(x,z,R),op=any&&R.some(t=>t.hi===1000&&tp>=t.lo);open[k]=op?1:0;if(op)slab=false;
   V[I(X,0,Z)]=1;for(let y=1;y<=full;y++){let w;if(y==full)w=slab?(rd>0?8:9):0;else{const d=tp-y;w=d<rd?3:(mr&&d<rd+4?4:2);if(any&&carved(R,y,tp))w=0}V[I(X,y,Z)]=w}
   top[k]=tp;hs[k]=slab?1:0;used[k]=0}
  // rocas y guijarros (solo dentro del chunk)
  for(let lx=1;lx<15;lx++)for(let lz=1;lz<15;lz++){const k=lx*16+lz,x=ox+cx+lx,z=oz+cz+lz;if(open[k]||used[k]||slp[k]>.9)continue;
   const p=fbm(x/45,z/45,1,90)>.25?.035:.0025;if(rnd(x,z,1)>=p)continue;const r=rnd(x,z,2)<.25&&lx>=2&&lx<=13&&lz>=2&&lz<=13?2:1;
   for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++){const d=Math.sqrt(dx*dx+dz*dz);if(d>r+.4)continue;const a=lx+dx,c=lz+dz,q=a*16+c;if(open[q])continue;
    const h=Math.round((r+.8-d)*(.8+rnd(ox+cx+a,oz+cz+c,3)*.6));for(let t=0;t<h;t++)V[I(cx+a,top[q]+1+t,cz+c)]=2;used[q]=1}}
  for(let lx=0;lx<16;lx++)for(let lz=0;lz<16;lz++){const k=lx*16+lz;if(used[k]||open[k]||hs[k]||slp[k]>.6)continue;if(rnd(ox+cx+lx,oz+cz+lz,4)<.02)V[I(cx+lx,top[k]+1,cz+lz)]=9}
 }
 // menas (aproximadas: misma cantidad, tamaño y rango de altura que el mod)
 for(let cx=0;cx<N;cx+=16)for(let cz=0;cz<N;cz+=16)[[5,14,9,58],[6,8,7,40],[7,5,4,32]].forEach(([t,c,sz,my])=>{
  let a=(SL^SH^Math.imul(cx+ox,374761393)^Math.imul(cz+oz,668265263)^(t*977))>>>0;const r=()=>{a=a+0x6D2B79F5|0;let q=Math.imul(a^a>>>15,1|a);q=q+Math.imul(q^q>>>7,61|q)^q;return((q^q>>>14)>>>0)/4294967296};
  for(let k=0;k<c;k++){let x=cx+(r()*16|0),z=cz+(r()*16|0),y=2+(r()*(my-1)|0);for(let m=0;m<sz;m++){
   if(x>=0&&z>=0&&x<N&&z<N&&y>=1&&y<H&&V[I(x,y,z)]==2)V[I(x,y,z)]=t;x+=(r()*3|0)-1;y+=(r()*3|0)-1;z+=(r()*3|0)-1}}});
}

if(typeof module!=='undefined')module.exports={setSeed,height,mare,tubes,gen,vol:()=>({V,N,H})};
