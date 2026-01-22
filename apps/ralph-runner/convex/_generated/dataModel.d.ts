/* eslint-disable */
/**
 * Generated data model types.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { DataModelFromSchemaDefinition } from "convex/server";
import type { GenericId } from "convex/values";
import type schema from "../schema";

/**
 * The type of a document stored in Convex.
 */
export type Doc<TableName extends TableNames> =
  DataModelFromSchemaDefinition<typeof schema>["documents"][TableName];

/**
 * An identifier for a document in Convex.
 */
export type Id<TableName extends TableNames> = GenericId<TableName>;

/**
 * The names of all of your Convex tables.
 */
export type TableNames = keyof DataModelFromSchemaDefinition<typeof schema>["documents"];

/**
 * A type describing your Convex data model.
 */
export type DataModel = DataModelFromSchemaDefinition<typeof schema>;
