import { Injectable, inject } from '@angular/core';
import type { HistoryInsert, HistoryItem } from '../history';
import { AuthService } from './auth.service';

/**
 * Saved remediations for the signed-in user.
 *
 * Row-level security scopes every query to the caller's own rows, so these
 * calls never filter by user id themselves; the database refuses anything else.
 */
@Injectable({ providedIn: 'root' })
export class HistoryService {
  private auth = inject(AuthService);

  async list(): Promise<HistoryItem[]> {
    const { data, error } = await this.auth.client
      .from('remediations')
      .select('id, created_at, title, source, original_text, latex, page_count')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(`Could not load your history: ${error.message}`);
    return data as HistoryItem[];
  }

  async save(row: HistoryInsert): Promise<void> {
    const { error } = await this.auth.client.from('remediations').insert(row);
    if (error) throw new Error(`Could not save to your history: ${error.message}`);
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.auth.client.from('remediations').delete().eq('id', id);
    if (error) throw new Error(`Could not delete that item: ${error.message}`);
  }
}
