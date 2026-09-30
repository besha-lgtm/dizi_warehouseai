import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ChatHistoryItem {
  role: string;
  content: string;
}

export interface AssistantReply {
  reply: string;
  suggestions?: string[];
  dataRequired?: boolean;
}

export interface AssistantResponse {
  success: boolean;
  data: AssistantReply;
}

@Injectable({ providedIn: 'root' })
export class AssistantService {
  private readonly apiUrl = 'http://localhost:4300/api/assistant/chat';

  constructor(private http: HttpClient) {}

  sendMessage(message: string, history: ChatHistoryItem[]): Observable<AssistantResponse> {
    return this.http.post<AssistantResponse>(this.apiUrl, { message, history });
  }
}
