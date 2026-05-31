import type { Knex } from 'knex';

const ROLE_NAMES = ['SystemAdmin', 'PartnerAdmin', 'Operator', 'Viewer'] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('cms_roles', (table) => {
    table.uuid('id').primary();
    table.string('name', 64).notNullable().unique();
    table.string('description', 255).nullable();
    table.timestamps(true, true);
  });

  await knex.schema.createTable('cms_users', (table) => {
    table.uuid('id').primary();
    table.string('email', 320).notNullable().unique().index();
    table.string('display_name', 160).notNullable();
    table.string('password_hash', 256).notNullable();
    table.string('password_salt', 64).notNullable();
    table.boolean('is_active').notNullable().defaultTo(true).index();
    table.timestamps(true, true);
  });

  await knex.schema.createTable('cms_groups', (table) => {
    table.uuid('id').primary();
    table.string('name', 160).notNullable().unique().index();
    table.string('description', 500).nullable();
    table.timestamps(true, true);
  });

  await knex.schema.createTable('cms_user_roles', (table) => {
    table.uuid('user_id').notNullable().references('id').inTable('cms_users').onDelete('CASCADE');
    table.uuid('role_id').notNullable().references('id').inTable('cms_roles').onDelete('RESTRICT');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.primary(['user_id', 'role_id']);
  });

  await knex.schema.createTable('cms_user_groups', (table) => {
    table.uuid('user_id').notNullable().references('id').inTable('cms_users').onDelete('CASCADE');
    table.uuid('group_id').notNullable().references('id').inTable('cms_groups').onDelete('CASCADE');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.primary(['user_id', 'group_id']);
  });

  await knex.schema.createTable('cms_sessions', (table) => {
    table.uuid('id').primary();
    table.uuid('user_id').notNullable().references('id').inTable('cms_users').onDelete('CASCADE').index();
    table.string('token_hash', 128).notNullable().unique();
    table.timestamp('expires_at').notNullable().index();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('revoked_at').nullable();
  });

  await knex('cms_roles').insert(ROLE_NAMES.map((name) => ({ id: knex.fn.uuid(), name })));
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('cms_sessions');
  await knex.schema.dropTableIfExists('cms_user_groups');
  await knex.schema.dropTableIfExists('cms_user_roles');
  await knex.schema.dropTableIfExists('cms_groups');
  await knex.schema.dropTableIfExists('cms_users');
  await knex.schema.dropTableIfExists('cms_roles');
}
