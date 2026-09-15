import {vowels,vowelWeights} from './vowels.js';
// Missing vowels use the base mouth. Supplied PSD shapes retain their own artwork.
export function mouthVariantWeights(part,pose,settings){
 const weights=vowelWeights(pose,settings),out={base:0};
 for(const k of vowels)if(part.mouthVariants?.[k])out[k]=0;
 if(!weights.some(Boolean)){out.base=1;return out;}
 weights.forEach((w,i)=>out[part.mouthVariants?.[vowels[i]]?vowels[i]:'base']+=w);
 return out;
}
