-- Helpers only needed inside policies / other functions.
revoke execute on function public.is_member(uuid) from anon;
revoke execute on function public.has_role(uuid, public.member_role[]) from anon;
revoke execute on function public.store_now(uuid) from authenticated;
