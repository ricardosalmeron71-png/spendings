import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase, unwrap } from './supabase';
import type { Group, Profile } from './types';

interface SessionState {
  session: Session | null;
  loading: boolean;
  profile: Profile | null;
  groups: Group[];
  group: Group | null;
  groupsLoading: boolean;
  setActiveGroup: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const EMPTY_GROUPS: Group[] = [];

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();
  const userId = session?.user.id;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) qc.clear();
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  const profileQ = useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId,
    queryFn: async () => unwrap(await supabase.from('profiles').select('*').eq('id', userId!).single()) as Profile,
  });

  const groupsQ = useQuery({
    queryKey: ['groups', userId],
    enabled: !!userId,
    queryFn: async () => {
      const rows = unwrap(
        await supabase.from('group_members').select('groups(*)').eq('user_id', userId!),
      ) as unknown as { groups: Group }[];
      return rows.map((r) => r.groups).filter(Boolean);
    },
  });

  const groups = groupsQ.data ?? EMPTY_GROUPS;
  const profile = profileQ.data ?? null;
  const group = groups.find((g) => g.id === profile?.active_group_id) ?? groups[0] ?? null;

  const setActiveGroup = useCallback(
    async (id: string) => {
      if (!userId) return;
      await supabase.from('profiles').update({ active_group_id: id }).eq('id', userId);
      await qc.invalidateQueries({ queryKey: ['profile', userId] });
    },
    [qc, userId],
  );

  const refresh = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['profile', userId] }),
      qc.invalidateQueries({ queryKey: ['groups', userId] }),
    ]);
  }, [qc, userId]);

  const signOut = useCallback(async () => {
    const { unregisterPushToken } = await import('./notifications');
    await unregisterPushToken().catch(() => {});
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<SessionState>(
    () => ({
      session,
      loading: loading || (!!userId && (profileQ.isLoading || groupsQ.isLoading)),
      profile,
      groups,
      group,
      groupsLoading: groupsQ.isLoading,
      setActiveGroup,
      refresh,
      signOut,
    }),
    [session, loading, userId, profileQ.isLoading, groupsQ.isLoading, profile, groups, group, setActiveGroup, refresh, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession debe usarse dentro de SessionProvider');
  return v;
}

/** Atajo para pantallas que requieren grupo activo */
export function useGroup() {
  const { group, session } = useSession();
  return { group: group!, groupId: group?.id as string, userId: session?.user.id as string };
}
