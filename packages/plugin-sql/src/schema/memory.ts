import {
	pgTable,
	uuid,
	text,
	jsonb,
	vector,
	index,
	boolean,
	foreignKey,
	unique,
	check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { numberTimestamp } from "./types";
import { entityTable } from "./entity";
import { roomTable } from "./room";
import { embeddingTable } from "./embedding";
import { agentTable } from "./agent";

/**
 * Definition of the memory table in the database.
 * 
 * @param {string} tableName - The name of the table.
 * @param {object} columns - An object containing the column definitions.
 * @param {function} indexes - A function that defines the indexes for the table.
 * @returns {object} - The memory table object.
 */
export const memoryTable = pgTable(
	"memories",
	{
		id: uuid("id").primaryKey().notNull(),
		type: text("type").notNull(),
		createdAt: numberTimestamp("createdAt").default(sql`now()`).notNull(),
		content: jsonb("content").notNull(),
		entityId: uuid("entityId").references(() => entityTable.id, {
			onDelete: "cascade",
		}),
		agentId: uuid("agentId").references(() => agentTable.id, {
			onDelete: "cascade",
		}),
		roomId: uuid("roomId").references(() => roomTable.id, {
			onDelete: "cascade",
		}),
		unique: boolean("unique").default(true).notNull(),
		metadata: jsonb("metadata").default({}).notNull(),
	},
	(table) => [
		index("idx_memories_type_room").on(table.type, table.roomId),
		foreignKey({
			name: "fk_room",
			columns: [table.roomId],
			foreignColumns: [roomTable.id],
		}).onDelete("cascade"),
		foreignKey({
			name: "fk_user",
			columns: [table.entityId],
			foreignColumns: [entityTable.id],
		}).onDelete("cascade"),
		foreignKey({
			name: "fk_agent",
			columns: [table.agentId],
			foreignColumns: [entityTable.id],
		}).onDelete("cascade"),
		index("idx_memories_metadata_type").on(sql`((metadata->>'type'))`),
		index("idx_memories_document_id").on(sql`((metadata->>'documentId'))`),
		index("idx_fragments_order").on(
			sql`((metadata->>'documentId'))`,
			sql`((metadata->>'position'))`,
		),
		check(
			"fragment_metadata_check",
			sql`
            CASE 
                WHEN metadata->>'type' = 'fragment' THEN
                    metadata ? 'documentId' AND 
                    metadata ? 'position'
                ELSE true
            END
        `,
		),
		check(
			"document_metadata_check",
			sql`
            CASE 
                WHEN metadata->>'type' = 'document' THEN
                    metadata ? 'timestamp'
                ELSE true
            END
        `,
		),
	],
);

export const memoryRelations = relations(memoryTable, ({ one }) => ({
	embedding: one(embeddingTable),
}));
