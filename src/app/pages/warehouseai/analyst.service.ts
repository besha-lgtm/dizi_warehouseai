import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface AnalystRow {
  [key: string]: string | number | boolean | null;
}

export interface AnalystResult {
  reply: string;
  rows: AnalystRow[];
  sql: string | null;
  cannotAnswer: boolean;
}

export interface AnalystResponse {
  success: boolean;
  data: AnalystResult;
}

@Injectable({ providedIn: 'root' })
export class AnalystService {
  private readonly apiUrl = 'http://localhost:4301/api/analyst/query';

  constructor(private http: HttpClient) {}

  query(question: string, history: Array<{ role: string; content: string }> = []): Observable<AnalystResponse> {
    return this.http.post<AnalystResponse>(this.apiUrl, { question, history });
  }
}
