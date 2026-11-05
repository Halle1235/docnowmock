DO $$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('public.book_unpaid_consultation(jsonb,jsonb)'::regprocedure);
 definition:=replace(definition,'phone text:=','input_phone text:=');
 definition:=replace(definition,$old$(phone<>'' AND phone !~$old$, $new$(input_phone<>'' AND input_phone !~$new$);
 definition:=replace(definition,$old$phone=nullif(phone,'')$old$, $new$phone=nullif(input_phone,'')$new$);
 EXECUTE definition;
END $$;