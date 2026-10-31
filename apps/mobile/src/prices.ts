import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/**
 * What recent Pechkas jobs of one kind really went for: the middle half of
 * the price for the WORK (parts taken out), from finished jobs in the last
 * `days`. The database sends one only when at least 10 jobs of that kind
 * were finished in that time (migration …_prices); below that there is
 * nothing to show, and nothing is shown. "Something else" never has one.
 */
export type PriceRange = { n: number; low_paisa: number; high_paisa: number; days: number };

/** The ranges for every kind of job that has one, keyed by job type id. Empty until it loads, and on a database without them. */
export function usePriceRanges(): Record<string, PriceRange> {
  const [ranges, setRanges] = useState<Record<string, PriceRange>>({});
  useEffect(() => {
    let alive = true;
    supabase
      ?.rpc('price_ranges')
      .then(({ data }) => {
        if (alive && data?.ranges) setRanges(data.ranges as Record<string, PriceRange>);
      })
      .then(undefined, () => {});
    return () => {
      alive = false;
    };
  }, []);
  return ranges;
}
