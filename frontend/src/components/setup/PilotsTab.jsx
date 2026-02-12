import React, { useState } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../ui/dialog';
import { StreamThumbnail } from '../StreamThumbnail.jsx';
import { CategoryBar } from '../CategoryBadge.jsx';
import { toast } from 'sonner';
import { Trash2, Plus, Edit } from 'lucide-react';

export default function PilotsTab() {
  const { t } = useTranslation();
  const {
    pilots,
    categories,
    addPilot,
    updatePilot,
    deletePilot,
    togglePilotActive
  } = useRally();

  const [newPilot, setNewPilot] = useState({ name: '', carNumber: '', picture: '', streamUrl: '', categoryId: null, startOrder: '' });
  const [editingPilot, setEditingPilot] = useState(null);
  const [pilotDialogOpen, setPilotDialogOpen] = useState(false);

  const handleAddPilot = () => {
    if (!newPilot.name.trim()) {
      toast.error(t('pilots.pilotName') + ' is required');
      return;
    }
    const pilotData = {
      ...newPilot,
      startOrder: parseInt(newPilot.startOrder) || 999
    };
    addPilot(pilotData);
    setNewPilot({ name: '', carNumber: '', picture: '', streamUrl: '', categoryId: null, startOrder: '' });
    toast.success('Pilot added successfully');
  };

  const handleUpdatePilot = () => {
    if (!editingPilot.name.trim()) {
      toast.error(t('pilots.pilotName') + ' is required');
      return;
    }
    const pilotData = {
      ...editingPilot,
      startOrder: parseInt(editingPilot.startOrder) || 999
    };
    updatePilot(editingPilot.id, pilotData);
    setEditingPilot(null);
    setPilotDialogOpen(false);
    toast.success('Pilot updated successfully');
  };

  const sortedPilots = [...pilots].sort((a, b) => {
    const orderA = a.startOrder || 999;
    const orderB = b.startOrder || 999;
    return orderA - orderB;
  });

  return (
    <div className="space-y-4">
      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader>
          <CardTitle className="uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>{t('pilots.addNewPilot')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
            <div>
              <Label htmlFor="pilot-name" className="text-white">{t('pilots.pilotName')} *</Label>
              <Input
                id="pilot-name"
                value={newPilot.name}
                onChange={(e) => setNewPilot({ ...newPilot, name: e.target.value })}
                placeholder={t('pilots.placeholder.name')}
                className="bg-[#09090B] border-zinc-700 text-white"
                data-testid="input-pilot-name"
              />
            </div>
            <div>
              <Label htmlFor="pilot-car-number" className="text-white">{t('pilots.carNumber')}</Label>
              <Input
                id="pilot-car-number"
                value={newPilot.carNumber}
                onChange={(e) => setNewPilot({ ...newPilot, carNumber: e.target.value })}
                placeholder={t('pilots.placeholder.carNumber')}
                className="bg-[#09090B] border-zinc-700 text-white"
                data-testid="input-pilot-car-number"
              />
            </div>
            <div>
              <Label htmlFor="pilot-order" className="text-white">{t('pilots.startOrder')}</Label>
              <Input
                id="pilot-order"
                type="number"
                value={newPilot.startOrder}
                onChange={(e) => setNewPilot({ ...newPilot, startOrder: e.target.value })}
                placeholder={t('pilots.placeholder.startOrder')}
                className="bg-[#09090B] border-zinc-700 text-white"
                data-testid="input-pilot-order"
              />
            </div>
            <div>
              <Label htmlFor="pilot-category" className="text-white">{t('pilots.category')}</Label>
              <Select value={newPilot.categoryId || 'none'} onValueChange={(val) => setNewPilot({ ...newPilot, categoryId: val === 'none' ? null : val })}>
                <SelectTrigger className="bg-[#09090B] border-zinc-700 text-white" id="pilot-category">
                  <SelectValue placeholder={t('common.select')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('common.none')}</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="pilot-picture" className="text-white">{t('pilots.pictureUrl')}</Label>
              <Input
                id="pilot-picture"
                value={newPilot.picture}
                onChange={(e) => setNewPilot({ ...newPilot, picture: e.target.value })}
                placeholder={t('pilots.placeholder.pictureUrl')}
                className="bg-[#09090B] border-zinc-700 text-white"
                data-testid="input-pilot-picture"
              />
            </div>
            <div>
              <Label htmlFor="pilot-stream" className="text-white">{t('pilots.streamUrl')}</Label>
              <Input
                id="pilot-stream"
                value={newPilot.streamUrl}
                onChange={(e) => setNewPilot({ ...newPilot, streamUrl: e.target.value })}
                placeholder={t('pilots.placeholder.streamUrl')}
                className="bg-[#09090B] border-zinc-700 text-white"
                data-testid="input-pilot-stream"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleAddPilot}
                className="w-full bg-[#FF4500] hover:bg-[#FF4500]/90"
                data-testid="button-add-pilot"
              >
                <Plus className="w-4 h-4 mr-2" />
                {t('pilots.addPilot')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedPilots.map((pilot) => (
          <Card key={pilot.id} className="bg-[#18181B] border-zinc-800 relative" data-testid={`pilot-card-${pilot.id}`}>
            <CategoryBar categoryId={pilot.categoryId} />
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <StreamThumbnail
                  streamUrl={pilot.streamUrl}
                  name={pilot.name}
                  showAlways={true}
                  className="w-20 h-20 rounded flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 text-sm">#{pilot.startOrder || '?'}</span>
                    {pilot.carNumber && (
                      <span className="bg-[#FF4500] text-white text-xs font-bold px-1.5 py-0.5 rounded">
                        {pilot.carNumber}
                      </span>
                    )}
                    <h3 className="font-bold text-lg uppercase truncate text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                      {pilot.name}
                    </h3>
                  </div>
                  {pilot.streamUrl && (
                    <p className="text-xs text-zinc-500 truncate font-mono mt-1">{pilot.streamUrl}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <Switch
                      checked={pilot.isActive}
                      onCheckedChange={() => togglePilotActive(pilot.id)}
                      className="data-[state=checked]:bg-[#22C55E]"
                      data-testid={`switch-pilot-active-${pilot.id}`}
                    />
                    <span className="text-sm text-white">{pilot.isActive ? t('status.active') : t('status.inactive')}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Dialog open={pilotDialogOpen && editingPilot?.id === pilot.id} onOpenChange={(open) => {
                    setPilotDialogOpen(open);
                    if (!open) setEditingPilot(null);
                  }}>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingPilot({ ...pilot })}
                        className="text-blue-500 hover:text-blue-400 hover:bg-blue-500/10"
                        data-testid={`button-edit-pilot-${pilot.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-[#18181B] border-zinc-800 text-white">
                      <DialogHeader>
                        <DialogTitle className="text-white">{t('common.edit')} {t('tabs.pilots')}</DialogTitle>
                      </DialogHeader>
                      {editingPilot && (
                        <div className="space-y-4">
                          <div>
                            <Label className="text-white">{t('pilots.pilotName')} *</Label>
                            <Input
                              value={editingPilot.name}
                              onChange={(e) => setEditingPilot({ ...editingPilot, name: e.target.value })}
                              className="bg-[#09090B] border-zinc-700 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-white">{t('pilots.carNumber')}</Label>
                            <Input
                              value={editingPilot.carNumber || ''}
                              onChange={(e) => setEditingPilot({ ...editingPilot, carNumber: e.target.value })}
                              placeholder={t('pilots.placeholder.carNumber')}
                              className="bg-[#09090B] border-zinc-700 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-white">{t('pilots.startOrder')}</Label>
                            <Input
                              type="number"
                              value={editingPilot.startOrder || ''}
                              onChange={(e) => setEditingPilot({ ...editingPilot, startOrder: e.target.value })}
                              className="bg-[#09090B] border-zinc-700 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-white">{t('pilots.category')}</Label>
                            <Select value={editingPilot.categoryId || 'none'} onValueChange={(val) => setEditingPilot({ ...editingPilot, categoryId: val === 'none' ? null : val })}>
                              <SelectTrigger className="bg-[#09090B] border-zinc-700 text-white">
                                <SelectValue placeholder={t('common.select')} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">{t('common.none')}</SelectItem>
                                {categories.map((cat) => (
                                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-white">{t('pilots.pictureUrl')}</Label>
                            <Input
                              value={editingPilot.picture}
                              onChange={(e) => setEditingPilot({ ...editingPilot, picture: e.target.value })}
                              className="bg-[#09090B] border-zinc-700 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-white">{t('pilots.streamUrl')}</Label>
                            <Input
                              value={editingPilot.streamUrl}
                              onChange={(e) => setEditingPilot({ ...editingPilot, streamUrl: e.target.value })}
                              className="bg-[#09090B] border-zinc-700 text-white"
                            />
                          </div>
                        </div>
                      )}
                      <DialogFooter>
                        <Button onClick={handleUpdatePilot} className="bg-[#FF4500] hover:bg-[#FF4500]/90">
                          {t('common.save')}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (window.confirm(t('common.delete') + '?')) {
                        deletePilot(pilot.id);
                        toast.success('Pilot deleted');
                      }
                    }}
                    className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                    data-testid={`button-delete-pilot-${pilot.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {sortedPilots.length === 0 && (
        <div className="text-center py-12 text-zinc-500">
          {t('pilots.noPilots')}
        </div>
      )}
    </div>
  );
}
