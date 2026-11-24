const { PGlite } = require('@electric-sql/pglite');
const { readFileSync } = require('node:fs');
const { strict: assert } = require('node:assert');
const { join } = require('node:path');

(async () => {
  const db = new PGlite();
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const [patient, otherPatient, doctor, admin, visit, unfinished] = [1,2,3,4,5,6].map(id);
  const one = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0] || {})[0];
  const as = async (actor, role = 'authenticated') => db.exec(`RESET ROLE; SET ROLE ${role}; SELECT set_config('app.uid','${actor}',false)`);
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('app.uid',true),'')::uuid $$;
      CREATE TYPE app_role AS ENUM ('patient','doctor','admin');
      CREATE TABLE user_roles(user_id uuid NOT NULL, role app_role NOT NULL);
      CREATE TABLE profiles(id uuid PRIMARY KEY, full_name text);
      CREATE TABLE consultations(id uuid PRIMARY KEY, patient_id uuid, doctor_id uuid, status text);
      CREATE TABLE audit_log(actor_id uuid, table_name text, record_id text, action text);
      CREATE FUNCTION public.has_role(_user_id uuid, _role app_role) RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
        SELECT _user_id = auth.uid() AND EXISTS(SELECT 1 FROM public.user_roles
          WHERE user_id = _user_id AND role = _role) $$;
      INSERT INTO user_roles VALUES ('${patient}','patient'),('${otherPatient}','patient'),('${doctor}','doctor'),('${admin}','admin');
      INSERT INTO profiles VALUES ('${doctor}','Fictional Doctor');
      INSERT INTO consultations VALUES ('${visit}','${patient}','${doctor}','completed'),
        ('${unfinished}','${otherPatient}','${doctor}','in_progress');
    `);
    const migration = readFileSync(join(__dirname,'..','drizzle','feedback','001_private_visit_feedback.sql'),'utf8');
    await db.exec(migration);
    await db.exec(migration);
    await as(patient);
    await assert.rejects(db.query('SELECT * FROM visit_feedback'), /permission denied/);
    assert.equal(await one('SELECT submit_visit_feedback($1,5,2,$2)',[visit,'Sound dropped']),true);
    assert.equal(await one('SELECT submit_visit_feedback($1,1,1,$2)',[visit,'Duplicate']),false);
    assert.equal((await one('SELECT my_visit_feedback()')).length,1);
    await assert.rejects(db.query('SELECT admin_visit_feedback()'),/Administrator required/);
    await as(otherPatient);
    assert.deepEqual(await one('SELECT my_visit_feedback()'),[]);
    await assert.rejects(db.query('SELECT submit_visit_feedback($1,3,3,$2)',[visit,'Other patient']),/Completed patient visit required/);
    await assert.rejects(db.query('SELECT submit_visit_feedback($1,3,3,$2)',[unfinished,'Not finished']),/Completed patient visit required/);
    await as(doctor);
    await assert.rejects(db.query('SELECT submit_visit_feedback($1,3,3,$2)',[visit,'Doctor']),/Completed patient visit required/);
    await as(admin);
    await assert.rejects(db.query('SELECT * FROM visit_feedback'),/permission denied/);
    const results = await one('SELECT admin_visit_feedback()');
    assert.equal(results.length,1);
    assert.equal(results[0].doctor_name,'Fictional Doctor');
    assert.equal(results[0].comment,'Sound dropped');
    await db.exec('RESET ROLE');
    assert.equal(await one("SELECT count(*)::int FROM audit_log WHERE actor_id=$1 AND table_name='visit_feedback' AND action='SELECT'",[admin]),1);
    console.log('Private visit feedback passed: completed-only submission, isolation, one response, and audited admin read.');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
