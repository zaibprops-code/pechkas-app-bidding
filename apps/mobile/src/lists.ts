import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

/** What public.app_lists() returns. Public: the website prints all of it. */
export type Lists = {
  trades: { slug: string; name: string }[];
  sectors: string[];
  live_sectors: string[];
  job_types: { id: number; trade: string; name: string; list_paisa: number | null }[];
  min_offer_paisa: number;
};

const KEY = 'pechkas.lists';
let memory: Lists | null = null;

/**
 * The trades, sectors and website prices. Kept on the phone after the first
 * load, so the form still opens in a stairwell with no signal; refreshed
 * whenever there is one.
 */
export function useLists(): Lists | null {
  const [lists, setLists] = useState<Lists | null>(memory);
  useEffect(() => {
    let alive = true;
    if (!memory) {
      AsyncStorage.getItem(KEY)
        .then((saved) => {
          if (alive && saved && !memory) setLists(JSON.parse(saved));
        })
        .catch(() => {});
    }
    supabase?.rpc('app_lists').then(({ data }) => {
      if (!alive || !data) return;
      memory = data as Lists;
      setLists(memory);
      AsyncStorage.setItem(KEY, JSON.stringify(memory)).catch(() => {});
    });
    return () => {
      alive = false;
    };
  }, []);
  return lists;
}
