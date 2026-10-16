import {z} from 'zod';
import {NullableTextSchema,collection} from './primitives';
import {FontSchema,ColorSchema,LogoSchema} from './value-types';
export const BrandingAndStyleSchema=z.object({writing_style_description:NullableTextSchema,art_style_description:NullableTextSchema,fonts:collection(FontSchema),brand_colors:collection(ColorSchema),logos:collection(LogoSchema)}).strict();
export type BrandingAndStyle=z.infer<typeof BrandingAndStyleSchema>;
