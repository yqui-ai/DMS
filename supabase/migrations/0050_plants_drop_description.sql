/* Adding a plant asks for four things — code, name, city, country — so `description` has nothing
   writing it.

   Dropped rather than left in place. A nullable column no form fills and no screen reads is the
   same dead weight as `fmds.owner` (dropped in 0030) and `xref_tables.version`: it looks like data
   to whoever reads the schema next, and the first person to start populating it creates a second
   place the truth might live. The table is a day old and the column is empty, so nothing is lost.

   The programme is no longer asked for on the form either — it comes from the context you are
   adding the plant in — but `program_id` stays, and stays NOT NULL. That one is the row's scope:
   it is what RLS reads and what makes plant 1010 in one engagement a different record from plant
   1010 in another. Not asking a question is not the same as not having an answer. */

alter table plants drop column if exists description;
