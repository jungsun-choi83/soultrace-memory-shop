/** Public synthetic fixtures ONLY. Never query or merge these in live mode. */
export const DEMO_EMAIL = 'bori@example.test';
export const DEMO_ARCHIVES = Object.freeze([
  { id: 'demo-bori-summer', owner: DEMO_EMAIL, petName: '보리', title: '보리와 보낸 첫여름', createdAt: '2026-09-12T03:00:00Z', message: '너와 함께한 평범한 하루가, 나에게는 가장 특별한 기억이야.', letter: '보리에게.\n\n햇살이 드는 창가에서 우리가 나란히 앉아 있던 오후를 기억해. 특별한 일을 하지 않아도 함께 있다는 것만으로 충분했던 시간.\n\n너와 함께한 평범한 하루들을 오래 간직하고 싶어. 내 곁에 와줘서 고마워.\n\n언제나 사랑을 담아.', photos: [{ id:'bori-1', label:'창가의 보리', file:'pet-bori.webp' },{ id:'bori-2',label:'산책하는 보리',file:'pet-bori-two.webp' },{ id:'bori-3',label:'보리의 일상',file:'pet-bori-three.webp' }] },
  { id: 'demo-bori-birthday', owner: DEMO_EMAIL, petName: '보리', title: '보리의 생일에 남긴 편지', createdAt: '2026-09-16T03:00:00Z', message:'올해도 네 생일을 함께해서 좋아.', letter:'보리에게.\n\n생일 축하해. 오늘은 네가 좋아하는 자리에서 조금 더 오래 함께 있었어.\n\n다음 생일에도, 별일 없는 평범한 오후에도 네 곁에 있고 싶어.\n\n함께하는 오늘이 참 고마워.', photos:[{id:'birthday-1',label:'생일의 보리',file:'pet-bori-two.webp'}] },
  { id:'demo-nabi-note',owner:'nabi@example.test',petName:'나비',title:'나비에게 남기는 짧은 메모',createdAt:'2026-09-10T00:00:00Z',message:'우리 집에 와줘서 고마워.',letter:'나비에게.\n\n조용한 오후를 함께해줘서 고마워.',photos:[] }
]);
export function demoList(email) { return DEMO_ARCHIVES.filter(x=>x.owner===email).map(({id,petName,title,createdAt,photos})=>({id,petName,title,createdAt,photoCount:photos.length})); }
export function demoDetail(email,id) {
  const record=DEMO_ARCHIVES.find(x=>x.owner===email && x.id===id);
  if(!record)return null;
  const {owner,...data}=record;
  return {...data,photos:data.photos.map(({id,label})=>({id,label}))};
}
