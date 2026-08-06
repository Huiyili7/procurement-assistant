import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@client/src/components/ui/dialog';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import { Label } from '@client/src/components/ui/label';
import { Textarea } from '@client/src/components/ui/textarea';
import { toast } from 'sonner';
import { procurement } from '@client/src/api';
import type { ProcurementRequirement, UpdateRequirementRequest } from '@shared/api.interface';
import { Loader2, Package, FolderOpen, Truck, FileText } from 'lucide-react';

interface RequirementEditDialogProps {
  requirementId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export const RequirementEditDialog: React.FC<RequirementEditDialogProps> = ({
  requirementId,
  open,
  onOpenChange,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<ProcurementRequirement | null>(null);
  const [formData, setFormData] = useState<UpdateRequirementRequest>({});

  useEffect(() => {
    if (open && requirementId) {
      loadDetail();
    }
  }, [open, requirementId]);

  const loadDetail = async () => {
    setLoading(true);
    try {
      const data = await procurement.getRequirementDetail(requirementId);
      setDetail(data);
      setFormData({
        itemName: data.item.name,
        itemBrandModel: data.item.brandModel,
        itemLink: data.item.link,
        itemQuantity: data.item.quantity,
        itemUnit: data.item.unit,
        projectCode: data.project.code,
        projectPurpose: data.project.purpose,
        contactPhone: data.logistics.contactPhone,
        deliveryAddress: data.logistics.deliveryAddress,
        expectedDelivery: data.logistics.expectedDelivery?.split('T')[0],
        specialRequirements: data.specialRequirements,
      });
    } catch {
      toast.error('加载需求详情失败');
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.itemName?.trim()) {
      toast.error('物料名称不能为空');
      return;
    }
    if (!formData.itemLink?.trim()) {
      toast.error('商品链接不能为空');
      return;
    }
    if (!formData.itemQuantity?.trim()) {
      toast.error('采购份数不能为空');
      return;
    }
    if (!formData.projectCode?.trim()) {
      toast.error('项目代号不能为空');
      return;
    }

    setSaving(true);
    try {
      await procurement.updateRequirement(requirementId, formData);
      toast.success('修改成功');
      onSuccess?.();
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '修改失败';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof UpdateRequirementRequest, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            修改采购需求
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* 物料信息 */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Package className="h-4 w-4" />
                物料信息
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="itemName">
                    物料名称 <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="itemName"
                    value={formData.itemName || ''}
                    onChange={(e) => updateField('itemName', e.target.value)}
                    placeholder="请输入物料名称"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="itemBrandModel">规格型号</Label>
                  <Input
                    id="itemBrandModel"
                    value={formData.itemBrandModel || ''}
                    onChange={(e) => updateField('itemBrandModel', e.target.value)}
                    placeholder="请输入规格型号"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="itemLink">
                  商品链接 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="itemLink"
                  value={formData.itemLink || ''}
                  onChange={(e) => updateField('itemLink', e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="itemQuantity">
                    采购份数 <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="itemQuantity"
                    value={formData.itemQuantity || ''}
                    onChange={(e) => updateField('itemQuantity', e.target.value)}
                    placeholder="如：5"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="itemUnit">单位</Label>
                  <Input
                    id="itemUnit"
                    value={formData.itemUnit || '份'}
                    onChange={(e) => updateField('itemUnit', e.target.value)}
                    placeholder="份"
                  />
                </div>
              </div>
            </div>

            {/* 项目信息 */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <FolderOpen className="h-4 w-4" />
                项目信息
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="projectCode">
                    项目代号 <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="projectCode"
                    value={formData.projectCode || ''}
                    onChange={(e) => updateField('projectCode', e.target.value)}
                    placeholder="如：DT002"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expectedDelivery">期望到货时间</Label>
                  <Input
                    id="expectedDelivery"
                    type="date"
                    value={formData.expectedDelivery || ''}
                    onChange={(e) => updateField('expectedDelivery', e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="projectPurpose">用途说明</Label>
                <Textarea
                  id="projectPurpose"
                  value={formData.projectPurpose || ''}
                  onChange={(e) => updateField('projectPurpose', e.target.value)}
                  placeholder="请输入用途说明"
                  rows={2}
                />
              </div>
            </div>

            {/* 物流信息 */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Truck className="h-4 w-4" />
                物流信息
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contactPhone">联系电话</Label>
                  <Input
                    id="contactPhone"
                    value={formData.contactPhone || ''}
                    onChange={(e) => updateField('contactPhone', e.target.value)}
                    placeholder="11位手机号"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deliveryAddress">收货地址</Label>
                  <Input
                    id="deliveryAddress"
                    value={formData.deliveryAddress || ''}
                    onChange={(e) => updateField('deliveryAddress', e.target.value)}
                    placeholder="收货地址"
                  />
                </div>
              </div>
            </div>

            {/* 其他信息 */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <FileText className="h-4 w-4" />
                其他信息
              </div>
              <div className="space-y-2">
                <Label htmlFor="specialRequirements">特殊要求</Label>
                <Textarea
                  id="specialRequirements"
                  value={formData.specialRequirements || ''}
                  onChange={(e) => updateField('specialRequirements', e.target.value)}
                  placeholder="如有特殊要求请在此说明"
                  rows={2}
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={loading || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            保存修改
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RequirementEditDialog;
