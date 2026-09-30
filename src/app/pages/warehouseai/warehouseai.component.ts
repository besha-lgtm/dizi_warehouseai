import { Component } from '@angular/core';
import { AssistantService } from './assistant.service';

@Component({
  selector: 'app-warehouseai',
  standalone: false,
  templateUrl: './warehouseai.component.html',
  styleUrl: './warehouseai.component.css'
})
export class WarehouseaiComponent {

  isChatOpen = false;
  chatMessages: { role: string; content: string }[] = [];
  currentMessage = '';
  isTyping = false;

  constructor(private assistantService: AssistantService) {}

  toggleChat(): void {
    this.isChatOpen = !this.isChatOpen;
    if (this.isChatOpen && this.chatMessages.length === 0) {
      this.chatMessages.push({ role: 'ai', content: 'Hi there! I am your AI assistant. How can I help you?' });
    }
  }

  sendMessage(): void {
    if (!this.currentMessage.trim()) return;

    const userMessage = this.currentMessage;
    const history = this.chatMessages.slice(-10).map(m => ({ role: m.role, content: m.content }));

    this.chatMessages.push({ role: 'user', content: userMessage });
    this.currentMessage = '';
    this.isTyping = true;

    this.assistantService.sendMessage(userMessage, history).subscribe({
      next: (res) => {
        this.isTyping = false;
        this.chatMessages.push({ role: 'ai', content: res.data.reply });
      },
      error: () => {
        this.isTyping = false;
        this.chatMessages.push({
          role: 'ai',
          content: "Sorry, I'm having trouble connecting right now. Please make sure the assistant service is running and try again."
        });
      }
    });
  }

}
