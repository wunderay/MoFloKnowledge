import { expect,it } from 'vitest';
import { CreateCompanySchema,MemberSchema,UpdateCompanySchema } from '../../src/contracts/api-companies';
import { EnqueueSchema } from '../../src/contracts/api-scrapes';
it('rejects authority injection, invalid URLs and excessive crawl ceilings',()=>{
const requestId='11111111-1111-4111-8111-111111111111';
expect(CreateCompanySchema.safeParse({name:'Acme',website:'https://acme.example',requestId,createdBy:requestId}).success).toBe(false);
expect(CreateCompanySchema.safeParse({name:'Acme',website:'javascript:alert(1)',requestId}).success).toBe(false);
expect(EnqueueSchema.safeParse({url:'https://acme.example',requestId,options:{documentLimit:26}}).success).toBe(false);
expect(MemberSchema.safeParse({role:'owner',remove:true}).success).toBe(false);
expect(UpdateCompanySchema.safeParse({expectedGeneration:0}).success).toBe(false);
});
