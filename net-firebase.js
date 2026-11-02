// Firebase 연결부: 게임은 이 파일의 함수만 사용해
const V='10.12.2',BASE='https://www.gstatic.com/firebasejs/'+V+'/';
export async function createNet(cfg){
  const [{initializeApp},A,F]=await Promise.all([import(BASE+'firebase-app.js'),import(BASE+'firebase-auth.js'),import(BASE+'firebase-firestore.js')]);
  const app=initializeApp(cfg),auth=A.getAuth(app),db=F.getFirestore(app);
  let offset=0;
  const d=p=>F.doc(db,p);
  return{
    kind:'firebase',
    onAuth:cb=>A.onAuthStateChanged(auth,u=>cb(u?{uid:u.uid,displayName:u.displayName||''}:null)),
    signIn:async()=>{const p=new A.GoogleAuthProvider();p.setCustomParameters({prompt:'select_account'});try{await A.signInWithPopup(auth,p)}catch(e){if(e.code==='auth/popup-blocked'||e.code==='auth/operation-not-supported-in-this-environment')await A.signInWithRedirect(auth,p);else throw e}},
    signOut:()=>A.signOut(auth),
    async syncClock(uid){try{const t0=Date.now();await F.setDoc(d('clock/'+uid),{t:F.serverTimestamp()});const s=await F.getDoc(d('clock/'+uid));const t1=Date.now();const srv=s.data().t.toMillis();offset=srv-(t0+t1)/2}catch(e){offset=0}},
    now:()=>Date.now()+offset,
    async get(p){const s=await F.getDoc(d(p));return s.exists()?s.data():null},
    set:(p,data,merge)=>F.setDoc(d(p),data,merge?{merge:true}:{}),
    update:(p,data)=>F.updateDoc(d(p),data),
    del:p=>F.deleteDoc(d(p)),
    watchDoc:(p,cb)=>F.onSnapshot(d(p),s=>cb(s.exists()?s.data():null),()=>cb(null)),
    watchCol:(p,cb)=>F.onSnapshot(F.collection(db,p),q=>cb(q.docs.map(x=>({id:x.id,...x.data()}))),()=>cb([])),
    async top(col,field,n){const q=F.query(F.collection(db,col),F.orderBy(field,'desc'),F.limit(n));const s=await F.getDocs(q);return s.docs.map(x=>({id:x.id,...x.data()}))}
  };
}
