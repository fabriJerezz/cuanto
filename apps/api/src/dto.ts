import { PartialType } from '@nestjs/mapped-types';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ACCOUNT_TYPES,
  MOVEMENT_TYPES,
  PERSON_KINDS,
  RELATIONS,
  type AccountType,
  type MovementType,
  type PersonKind,
  type Relation,
} from './entities.js';

export class CreateAccountDto {
  @IsString() @IsNotEmpty() @MaxLength(60) name: string;
  @IsIn(ACCOUNT_TYPES) type: AccountType;
  // For credit cards this is the current debt, entered as a positive number.
  @IsOptional() @IsInt() @Min(0) initialBalance?: number;
  @IsOptional() @IsInt() @Min(1) @Max(31) dueDay?: number | null;
}
export class UpdateAccountDto extends PartialType(CreateAccountDto) {}

export class CreatePersonDto {
  @IsString() @IsNotEmpty() @MaxLength(60) name: string;
  @IsOptional() @IsIn(PERSON_KINDS) kind?: PersonKind;
}
export class UpdatePersonDto extends PartialType(CreatePersonDto) {}

export class CreateEventDto {
  @IsString() @IsNotEmpty() @MaxLength(80) name: string;
  @IsOptional() @IsArray() @IsInt({ each: true }) personIds?: number[];
  @IsOptional() @IsBoolean() includeMe?: boolean;
  @IsOptional() @IsBoolean() closed?: boolean;
}
export class UpdateEventDto extends PartialType(CreateEventDto) {}

export class CreateCategoryDto {
  @IsString() @IsNotEmpty() @MaxLength(60) name: string;
  @IsOptional() @IsInt() @Min(0) monthlyLimit?: number;
}
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class CreateFixedExpenseDto {
  @IsString() @IsNotEmpty() @MaxLength(60) name: string;
  @IsInt() @Min(1) amount: number;
  @IsInt() @Min(1) @Max(31) dayOfMonth: number;
  @IsInt() accountId: number;
}
export class UpdateFixedExpenseDto extends PartialType(CreateFixedExpenseDto) {}

export class CreateMovementDto {
  @IsIn(MOVEMENT_TYPES) type: MovementType;
  @IsInt() @Min(1) amount: number;
  @IsOptional() @IsString() @MaxLength(120) description?: string;
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/) date: string;
  @IsInt() accountId: number;
  @IsOptional() @IsInt() toAccountId?: number | null;
  @IsOptional() @IsInt() categoryId?: number | null;
  @IsOptional() @IsBoolean() isOthers?: boolean;
  @IsOptional() @IsInt() personId?: number | null;
  // Creates the person on the fly ("+ Agregar persona…").
  @IsOptional() @IsString() @MaxLength(60) newPersonName?: string;
  @IsOptional() @IsIn(RELATIONS) relation?: Relation | null;
  @IsOptional() @IsInt() eventId?: number | null;
  // Free text from the form: matched against open events or created. An income's person joins the event.
  @IsOptional() @IsString() @MaxLength(80) eventName?: string;
  @IsOptional() @IsInt() fixedExpenseId?: number | null;
}
export class UpdateMovementDto extends PartialType(CreateMovementDto) {}

// DTO instances carry every declared key, absent ones as undefined: keep only what was sent.
export const defined = <T extends object>(dto: T) =>
  Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)) as Partial<T>;
