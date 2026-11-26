PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL);
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(1,'0000_init.sql','2026-11-01 00:00:00');
CREATE TABLE `facts` (`id` text PRIMARY KEY NOT NULL, `statement` text NOT NULL);
INSERT INTO "facts" ("id","org_id","category","statement","value","status","sensitivity","confidence","source_type","source_quote","created_at","updated_at") VALUES('fct_dump','org_dump','mission',replace('It''s "quoted"\nand multi-line','\n',char(10)),NULL,'confirmed','internal',0.9,'user_entered','',1732492800000,1732492800000);
INSERT INTO organization VALUES('org_dump','Dump; Org','dump-org',NULL,'{"a":1}',1732492800000);
DELETE FROM sqlite_sequence;
INSERT INTO "sqlite_sequence" VALUES('d1_migrations',1);
