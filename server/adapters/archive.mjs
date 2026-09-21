import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DEMO_ARCHIVES, demoList, demoDetail } from '../../src/fixtures.mjs';
import { HttpError, boundedBytes, validImage, assertId } from '../security.mjs';

const missing = () => new HttpError(404,'NOT_FOUND','이 기록을 불러올 수 없어요. 삭제되었거나 접근 권한이 없을 수 있습니다.');
const unavailable = () => new HttpError(502,'ARCHIVE_UNAVAILABLE','소울트레이스 연결을 잠시 사용할 수 없어요. 다시 시도하거나 직접 입력해주세요.');
function text(value,max,optional=false) { if(optional && value==null)return ''; if(typeof value!=='string'||value.length>max)throw new Error('Invalid bridge response');return value; }
function summary(item) { return { id:assertId(item.id),petName:text(item.petName,20),title:text(item.title,120),createdAt:text(item.createdAt,40),photoCount:Number.isInteger(item.photoCount)&&item.photoCount>=0&&item.photoCount<=100?item.photoCount:0 }; }
function detail(item) { return {...summary({...item,photoCount:item.photos?.length}),message:text(item.message,120,true),letter:text(item.letter,20_000,true),photos:(()=>{if(!Array.isArray(item.photos)||item.photos.length>100)throw new Error('Invalid photos');return item.photos.map(p=>({id:assertId(p.id),label:text(p.label,100,true)}));})()}; }
export function createArchiveAdapter(config) {
  if(config.mode==='demo') return {
    async list(email) {return {archives:demoList(email),nextCursor:null};},
    async read(email,id) {const r=demoDetail(email,id);if(!r)throw missing();return r;},
    async photo(email,id,photoId) {const record=DEMO_ARCHIVES.find(x=>x.owner===email&&x.id===id);const photo=record?.photos.find(x=>x.id===photoId);if(!photo)throw missing();return {type:'image/webp',bytes:await readFile(resolve(config.root,'assets',photo.file))};}
  };
  async function request(action,body,binary=false) {
    // These are PROPOSED bridge routes, not assumed existing SoulTrace APIs.
    try {
      const response=await fetch(new URL(`/internal/memory-shop/${action}`,config.bridgeOrigin),{method:'POST',redirect:'error',signal:AbortSignal.timeout(10_000),headers:{'Content-Type':'application/json','Authorization':`Bearer ${config.bridgeKey}`},body:JSON.stringify(body)});
      if(response.status===404||response.status===403)throw missing();
      if(!response.ok)throw unavailable();
      const bytes=await boundedBytes(response,binary?5*1024*1024:1_000_000);
      if(binary){const type=(response.headers.get('content-type')||'').split(';')[0];if(!validImage(bytes,type))throw new Error('Invalid image');return {type,bytes};}
      return JSON.parse(bytes.toString('utf8'));
    }catch(error){if(error instanceof HttpError)throw error;throw unavailable();}
  }
  return {
    async list(verifiedEmail,cursor=null) {
      const data=await request('list',{verifiedEmail,cursor});
      try {if(!Array.isArray(data.archives)||data.archives.length>100)throw new Error('Invalid archives');return {archives:data.archives.map(summary),nextCursor:data.nextCursor==null?null:text(data.nextCursor,128)};}catch{throw unavailable();}
    },
    async read(verifiedEmail,archiveId) {const data=await request('read',{verifiedEmail,archiveId});try{const r=detail(data.archive);if(r.id!==archiveId)throw new Error('ID mismatch');return r;}catch{throw unavailable();}},
    async photo(verifiedEmail,archiveId,photoId) {return request('photo',{verifiedEmail,archiveId,photoId},true);}
  };
}
