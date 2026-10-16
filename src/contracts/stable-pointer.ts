import {UUIDSchema} from './primitives';
export function escapePointerSegment(value:string):string{return value.replace(/~/g,'~0').replace(/\//g,'~1');}
export function parseStablePointer(path:string):string[]{if(path==='')return [];if(!path.startsWith('/')||/~(?:[^01]|$)/.test(path))throw new Error('Malformed stable pointer');return path.slice(1).split('/').map(x=>x.replace(/~1/g,'/').replace(/~0/g,'~'));}
export function resolveStablePointer(root:unknown,path:string):unknown{
 let value=root;
 for(const segment of parseStablePointer(path)){
  if(Array.isArray(value)){
   if(segment.startsWith('@')){const id=UUIDSchema.parse(segment.slice(1));const matches=value.filter(item=>item&&typeof item==='object'&&item.id===id);if(matches.length!==1)throw new Error('Unknown or duplicate stable item ID');value=matches[0];}
   else {if(value.some(item=>item&&typeof item==='object'&&'id' in item)||! /^(?:0|[1-9]\d*)$/.test(segment)||Number(segment)>=value.length)throw new Error('Business arrays require @UUID; metadata index out of bounds');value=value[Number(segment)];}
  }else if(value!==null&&typeof value==='object'&&Object.hasOwn(value,segment)){value=(value as Record<string,unknown>)[segment];}
  else throw new Error(`Unknown stable pointer: ${path}`);
 }
 return value;
}
export type FactualLeaf={path:string;value:string|number|boolean};
export function enumerateFactualLeaves(root:unknown,prefix=''):FactualLeaf[]{
 const result:FactualLeaf[]=[];
 function visit(value:unknown,path:string):void{
  if(value===null||value===undefined)return;
  if(Array.isArray(value)){const ids=new Set<string>();value.forEach((item,index)=>{let segment=String(index);if(item&&typeof item==='object'&&'id' in item){UUIDSchema.parse(item.id);if(ids.has(item.id))throw new Error('Duplicate stable item UUID');ids.add(item.id);segment=`@${item.id}`;}visit(item,`${path}/${segment}`);});return;}
  if(typeof value==='object'){for(const [key,item]of Object.entries(value))if(key!=='id')visit(item,`${path}/${escapePointerSegment(key)}`);return;}
  if(typeof value==='string'&&value.length===0)return;
  if(typeof value==='string'||typeof value==='number'||typeof value==='boolean')result.push({path,value});
 }
 visit(root,prefix);return result;
}
export function assertUniqueBusinessIds(root:unknown):void{const ids=new Set<string>();function visit(value:unknown):void{if(!value||typeof value!=='object')return;if(Array.isArray(value)){for(const item of value)visit(item);return;}if('id'in value){const id=UUIDSchema.parse(value.id);if(ids.has(id))throw new Error('Duplicate business UUID');ids.add(id);}for(const [key,item]of Object.entries(value))if(key!=='id')visit(item);}visit(root);}
