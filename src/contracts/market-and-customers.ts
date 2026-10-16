import {z} from 'zod';
import {collection} from './primitives';
import {IdentifiedTextSchema,PersonaSchema,CommentarySchema,ChannelSchema,FunnelSchema,CTASchema,PartnerSchema} from './value-types';
export const MarketAndCustomersSchema=z.object({target_buyers:collection(IdentifiedTextSchema),customer_needs:collection(IdentifiedTextSchema),ideal_customer_personas:collection(PersonaSchema),industry_groupings:collection(IdentifiedTextSchema),industry_outlook:collection(CommentarySchema),channels:collection(ChannelSchema),funnels:collection(FunnelSchema),ctas:collection(CTASchema),suppliers_and_partners:collection(PartnerSchema)}).strict();
export type MarketAndCustomers=z.infer<typeof MarketAndCustomersSchema>;
