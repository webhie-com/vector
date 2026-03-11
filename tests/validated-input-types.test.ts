import type { DefaultVectorTypes, VectorContext } from '../src/types';

type Expect<T extends true> = T;
type IsOptional<T, K extends keyof T> = {} extends Pick<T, K> ? true : false;

type InferredInput = {
  body: { id: string };
  params: { eventId: string };
};

type CtxWithSchema = VectorContext<DefaultVectorTypes, InferredInput>;
type CtxWithoutSchema = VectorContext<DefaultVectorTypes>;

type _validatedInputIsRequiredWhenSchemaExists = Expect<
  IsOptional<CtxWithSchema, 'validatedInput'> extends false ? true : false
>;

type _validatedInputIsOptionalWithoutSchema = Expect<
  IsOptional<CtxWithoutSchema, 'validatedInput'> extends true ? true : false
>;

// Runtime no-op assertions so this file is executed by bun test as well.
import { describe, expect, it } from 'bun:test';
describe('validatedInput typing', () => {
  it('compiles with required/optional validatedInput contracts', () => {
    expect(true).toBe(true);
  });
});
