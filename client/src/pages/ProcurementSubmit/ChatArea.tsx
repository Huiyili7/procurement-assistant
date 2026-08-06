import React from 'react';
import { Send, Loader2, Headset, X, FileText, ChevronRight, MessageSquare, ImagePlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { UniversalLink } from '@lark-apaas/client-toolkit/components/UniversalLink';
import type { ProjectInfoItem } from '@shared/api.interface';
import { COLLECT_FIELDS, isFieldFilled, formatFieldValue } from './constants';
import ProjectSuggestDropdown from './ProjectSuggestDropdown';
import CategorySuggestDropdown from './CategorySuggestDropdown';
import { useNavigate } from 'react-router-dom';

const FEISHU_CHAT_LINK = 'https://applink.feishu.cn/client/chat/open?openId=ou_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

interface ChatMessage {
  role: 'user' | 'bot';
  content: string;
  timestamp: Date | string;
  type?: 'transfer_card' | 'image_result' | 'pending_list';
  collected?: Record<string, unknown>;
  imageUrl?: string;
}

interface ChatAreaProps {
  messages: ChatMessage[];
  extracting: boolean;
  transferMode: boolean;
  transferReason: string;
  transferring: boolean;
  transferred: boolean;
  input: string;
  inputDisabled: boolean;
  modifying: boolean;
  modifyFieldKey: string | null;
  showPreview: boolean;
  currentField: { key: string; question: string } | undefined;
  projectSuggestions: ProjectInfoItem[];
  projectSearchLoading: boolean;
  showProjectSuggestions: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  messagesScrollRef: React.RefObject<HTMLDivElement | null>;
  onInputModeChange: (mode: 'chat' | 'form') => void;
  onSend: () => void;
  onInputChange: (value: string) => void;
  onTransferToHuman: () => void;
  onTransferReasonChange: (value: string) => void;
  onCancelTransfer: () => void;
  onStartTransfer: () => void;
  onSelectProject: (project: ProjectInfoItem) => void;
  onCloseProjectSuggestions: () => void;
  onReset: () => void;
  onImageUpload: (file: File) => void;
  imageUploading: boolean;
  onEditRequirement?: (id: string) => void;
}

const ChatArea: React.FC<ChatAreaProps> = ({
  messages, extracting, transferMode, transferReason, transferring,
  transferred, input, inputDisabled, modifying, modifyFieldKey,
  showPreview, currentField, projectSuggestions, projectSearchLoading,
  showProjectSuggestions, messagesEndRef, messagesScrollRef, onInputModeChange,
  onSend, onInputChange, onTransferToHuman, onTransferReasonChange,
  onCancelTransfer, onStartTransfer, onSelectProject, onCloseProjectSuggestions,
  onReset, onImageUpload, imageUploading, onEditRequirement,
}) => {
  const navigate = useNavigate();
  const [showCategorySuggestions, setShowCategorySuggestions] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const isItemNameField = currentField?.key === 'itemName' || (modifying && modifyFieldKey === 'itemName');
  return (
  <div className="flex flex-col flex-1 min-w-0">
    <Card className="flex flex-col flex-1 min-h-0">
      <CardHeader className="flex-shrink-0 pb-3">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center size-10 rounded-lg bg-primary/10">
                <MessageSquare className="size-5 text-primary" />
              </div>
              <h2 className="text-base font-semibold text-foreground">对话填报</h2>
            </div>
          <button
            type="button"
            onClick={() => onInputModeChange('form')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-card border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            <FileText className="size-4 text-muted-foreground" />
            切换到表单填报
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>
        </div>
      </CardHeader>
      <CardContent ref={messagesScrollRef} className="flex-1 overflow-y-auto px-3 md:px-6 pb-4 space-y-3 min-h-0">
        {messages.filter((msg) => msg.content?.trim?.() || msg.type === 'transfer_card' || msg.imageUrl).map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.type === 'transfer_card' ? (
              <div className="max-w-[90%] rounded-lg border border-purple-200 bg-purple-50/50 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-purple-700">
                  <Headset className="size-4" />
                  已转交人工处理
                </div>
                <p className="text-sm text-muted-foreground">
                  采购专员将尽快与您联系，您也可以
                  <UniversalLink to={FEISHU_CHAT_LINK} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                    点击此处直接对话
                  </UniversalLink>。
                </p>
                {msg.collected && (
                  <div className="space-y-1">
                    {COLLECT_FIELDS.filter((f) => isFieldFilled(f.key, msg.collected![f.key])).map((f) => (
                      <div key={f.key} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{f.label}</span>
                        <span className="font-medium text-foreground">{formatFieldValue(f.key, msg.collected![f.key])}</span>
                      </div>
                    ))}
                  </div>
                )}
                <Button variant="outline" size="sm" onClick={onReset} className="w-full">
                  发起新的采购需求
                </Button>
                <div className="text-[10px] text-muted-foreground">
                  {(typeof msg.timestamp === 'string' ? new Date(msg.timestamp) : msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ) : (
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card border border-border text-foreground'
                }`}
              >
                {msg.content}
                {msg.type === 'image_result' && msg.collected && (
                  <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
                    {COLLECT_FIELDS.filter((f) => isFieldFilled(f.key, msg.collected![f.key])).map((f) => (
                      <div key={f.key} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{f.label}</span>
                        <span className="font-medium text-foreground">{formatFieldValue(f.key, msg.collected![f.key])}</span>
                      </div>
                    ))}
                  </div>
                )}
                {msg.imageUrl && (
                  <div className="mt-2 rounded overflow-hidden">
                    <img src={msg.imageUrl} alt="上传截图" className="max-w-[200px] max-h-[150px] object-contain rounded" />
                  </div>
                )}
                {msg.type === 'pending_list' && msg.collected?.pendingItems && (
                  <div className="mt-3 space-y-2">
                    {(msg.collected.pendingItems as Array<{ id: string; requirementId: string; itemName: string; projectCode: string }>).map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 bg-background rounded px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{item.itemName}</div>
                          <div className="text-xs text-muted-foreground">{item.projectCode} · {item.requirementId}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onEditRequirement?.(item.id)}
                          className="px-3 py-1 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90"
                        >
                          修改
                        </button>
                      </div>
                    ))}
                    {(msg.collected.total as number) > 5 && (
                      <div className="text-xs text-muted-foreground text-center pt-1">
                        还有 {(msg.collected.total as number) - 5} 条待采购需求，
                        <button type="button" onClick={() => navigate('/my-requirements')} className="text-primary hover:underline">
                          前往列表页查看 →
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <div className={`text-[10px] mt-1 ${msg.role === 'user' ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                  {(typeof msg.timestamp === 'string' ? new Date(msg.timestamp) : msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            )}
          </div>
        ))}
        {extracting && (
          <div className="flex justify-start">
            <div className="bg-card border border-border rounded-lg px-4 py-2.5 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin" />
              正在分析信息...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </CardContent>

      {/* Input Area */}
      <div className="flex-shrink-0 p-3 md:p-4 border-t border-border">
        {transferMode ? (
          <div className="space-y-2">
            <Textarea
              value={transferReason}
              onChange={(e) => onTransferReasonChange(e.target.value)}
              placeholder="请输入转人工原因..."
              className="resize-none text-base md:text-sm"
              rows={2}
            />
            <div className="flex gap-2">
              <Button
                onClick={onTransferToHuman}
                disabled={!transferReason.trim() || transferring}
                size="default"
                className="flex-1 h-11 md:h-9"
              >
                {transferring ? <Loader2 className="size-5 md:size-4 animate-spin" /> : <Headset className="size-5 md:size-4" />}
                <span className="text-base md:text-sm">确认转人工</span>
              </Button>
              <Button
                variant="outline"
                size="default"
                onClick={onCancelTransfer}
                className="h-11 md:h-9 px-4 md:px-3"
              >
                <X className="size-5 md:size-4" />
                <span className="text-base md:text-sm">取消</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="relative">
             <form
              onSubmit={(e) => { e.preventDefault(); onSend(); }}
              className="flex gap-2 items-center"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    onImageUpload(file);
                    e.target.value = '';
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="default"
                onClick={() => fileInputRef.current?.click()}
                disabled={imageUploading}
                title="上传采购截图"
                className="h-11 w-11 md:h-9 md:w-9 p-0 flex-shrink-0"
              >
                {imageUploading ? <Loader2 className="size-5 md:size-4 animate-spin" /> : <ImagePlus className="size-5 md:size-4" />}
              </Button>
              <Input
                value={input}
                onChange={(e) => {
                  onInputChange(e.target.value);
                  if (isItemNameField) {
                    setShowCategorySuggestions(e.target.value.trim().length > 0);
                  }
                }}
                onFocus={() => isItemNameField && input.trim() && setShowCategorySuggestions(true)}
                onBlur={() => setTimeout(() => setShowCategorySuggestions(false), 200)}
                placeholder={
                  modifying && modifyFieldKey
                    ? `修改: ${COLLECT_FIELDS.find((f) => f.key === modifyFieldKey)?.label || ''}`
                    : showPreview
                      ? '对话已完成，请查看右侧预览'
                      : currentField
                        ? currentField.key === 'itemName'
                          ? '粘贴需求描述，如：买轴承SKF 6204-2RS 10个，链接https://xxx，用于DT002项目...'
                          : `回复: ${currentField.question}`
                        : '请输入...'
                }
                disabled={inputDisabled}
                className="flex-1"
              />
              <Button type="submit" disabled={!input.trim() || inputDisabled} size="default" className="h-11 w-11 md:h-9 md:w-9 p-0 flex-shrink-0">
                <Send className="size-5 md:size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="default"
                onClick={onStartTransfer}
                disabled={extracting || transferring || transferred}
                title="转人工处理"
                className="h-11 w-11 md:h-9 md:w-9 p-0 flex-shrink-0"
              >
                <Headset className="size-5 md:size-4" />
              </Button>
            </form>
            {showProjectSuggestions && (
              <ProjectSuggestDropdown
                suggestions={projectSuggestions}
                loading={projectSearchLoading}
                onSelect={onSelectProject}
                onClose={onCloseProjectSuggestions}
              />
            )}
            {showCategorySuggestions && isItemNameField && (
              <CategorySuggestDropdown
                keyword={input}
                onSelect={(cat) => {
                  onInputChange(cat);
                  setShowCategorySuggestions(false);
                }}
                onClose={() => setShowCategorySuggestions(false)}
              />
            )}
          </div>
        )}
      </div>
    </Card>
  </div>
);
};

export default ChatArea;
