import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

/** What public.app_lists() returns. Public: the website prints all of it. */
export type Lists = {
  /** by_time: bought by time, not by a result (Helper, A135). */
  trades: { slug: string; name: string; by_time?: boolean }[];
  sectors: string[];
  live_sectors: string[];
  /** Every place in Islamabad, Bahria Town and DHA among them (fast_posting). Absent from an older database. */
  islamabad_sectors?: string[];
  /** `floor_paisa`: the lowest a customer may set for that job (price_floor()). Absent from an older database. */
  job_types: { id: number; trade: string; name: string; list_paisa: number | null; floor_paisa?: number }[];
  min_offer_paisa: number;
  /** The share of the usual price that is the lowest (6000 = 60%), the office's setting. */
  min_price_bps?: number;
  /** Absent until the phase 4 migration is run; the post screen then says nothing about it. */
  visit_fee_min_paisa?: number;
  visit_fee_max_paisa?: number;
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
