import { Component } from '@angular/core';

@Component({
  selector: 'app-expense-review',
  standalone: false,
  templateUrl: './expense-review.component.html',
  styleUrls: ['./expense-review.component.css']
})
export class ExpenseReviewComponent {
  isChatOpen = false;
  chatMessages: { role: string; content: string }[] = [];
  currentMessage = '';
  isTyping = false;

  toggleChat(): void {
    this.isChatOpen = !this.isChatOpen;
    if (this.isChatOpen && this.chatMessages.length === 0) {
      this.chatMessages.push({ role: 'ai', content: 'Hi there! I am your AI assistant. How can I help you?' });
    }
  }

  sendMessage(): void {
    if (!this.currentMessage.trim()) return;

    const userMessage = this.currentMessage;
    this.chatMessages.push({ role: 'user', content: userMessage });
    this.currentMessage = '';
    this.isTyping = true;

    // Simulate AI response with keyword logic
    setTimeout(() => {
      this.isTyping = false;
      const lowerMsg = userMessage.toLowerCase();
      let responseText = '';

      if (lowerMsg.includes('total') || lowerMsg.includes('amount')) {
        responseText = 'The total amount extracted from this document is 1,601.25 AED. Would you like me to verify it against the ledger?';
      } else if (lowerMsg.includes('tax') || lowerMsg.includes('vat')) {
        responseText = 'I detected a 5% VAT on this invoice amounting to 76.25 AED, which matches the standard rate.';
      } else if (lowerMsg.includes('vendor') || lowerMsg.includes('from')) {
        responseText = 'This invoice is from "Novotel Dubai Al Barsha". They are an approved vendor in your ERP system.';
      } else if (lowerMsg.includes('policy') || lowerMsg.includes('compliance')) {
        responseText = 'This expense complies with the "Travel & Stay" policy limits. No violations were found.';
      } else if (lowerMsg.includes('approve') || lowerMsg.includes('post')) {
        responseText = 'You can click the "Post to ERP" button to finalize this expense. Let me know if you need me to adjust any line items first.';
      } else if (lowerMsg.includes('hello') || lowerMsg.includes('hi')) {
        responseText = 'Hello! I am DIZI AI. Ask me about the vendor, tax, total amount, or policy compliance for this document.';
      } else {
        responseText = `I'm analyzing your request: "${userMessage}". As an AI assistant, I can help you verify totals, check policy compliance, or review vendor details for this invoice!`;
      }

      this.chatMessages.push({
        role: 'ai',
        content: responseText
      });
    }, 1200);
  }
}
