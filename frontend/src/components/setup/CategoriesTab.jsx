import React, { useState } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../ui/dialog';
import { toast } from 'sonner';
import { Trash2, Plus, Edit } from 'lucide-react';

export default function CategoriesTab() {
  const {
    categories,
    addCategory,
    updateCategory,
    deleteCategory
  } = useRally();

  const [newCategory, setNewCategory] = useState({ name: '', color: '#FF4500' });
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);

  const handleAddCategory = () => {
    if (!newCategory.name.trim()) {
      toast.error('Category name is required');
      return;
    }
    addCategory(newCategory);
    setNewCategory({ name: '', color: '#FF4500' });
    toast.success('Category added successfully');
  };

  const handleUpdateCategory = () => {
    if (!editingCategory.name.trim()) {
      toast.error('Category name is required');
      return;
    }
    updateCategory(editingCategory.id, editingCategory);
    setEditingCategory(null);
    setCategoryDialogOpen(false);
    toast.success('Category updated successfully');
  };

  return (
    <div className="space-y-4">
      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader>
          <CardTitle className="uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Add New Category</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <Label className="text-white">Category Name *</Label>
              <Input
                value={newCategory.name}
                onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                placeholder="Group A"
                className="bg-[#09090B] border-zinc-700 text-white"
                data-testid="input-category-name"
              />
            </div>
            <div className="w-32">
              <Label className="text-white">Color</Label>
              <Input
                type="color"
                value={newCategory.color}
                onChange={(e) => setNewCategory({ ...newCategory, color: e.target.value })}
                className="h-10 cursor-pointer"
                data-testid="input-category-color"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleAddCategory}
                className="bg-[#FF4500] hover:bg-[#FF4500]/90"
                data-testid="button-add-category"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {categories.map((category) => (
          <Card key={category.id} className="bg-[#18181B] border-zinc-800 relative" data-testid={`category-card-${category.id}`}>
            <div className="absolute left-0 top-0 bottom-0 w-2" style={{ backgroundColor: category.color }} />
            <CardContent className="pt-6 pl-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="font-bold text-xl uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif', color: category.color }}>
                    {category.name}
                  </h3>
                  <p className="text-xs text-zinc-500 mt-1">{category.color}</p>
                </div>
                <div className="flex gap-1">
                  <Dialog open={categoryDialogOpen && editingCategory?.id === category.id} onOpenChange={(open) => {
                    setCategoryDialogOpen(open);
                    if (!open) setEditingCategory(null);
                  }}>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingCategory({ ...category })}
                        className="text-blue-500 hover:text-blue-400 hover:bg-blue-500/10"
                        data-testid={`button-edit-category-${category.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-[#18181B] border-zinc-800 text-white">
                      <DialogHeader>
                        <DialogTitle className="text-white">Edit Category</DialogTitle>
                      </DialogHeader>
                      {editingCategory && (
                        <div className="space-y-4">
                          <div>
                            <Label className="text-white">Category Name *</Label>
                            <Input
                              value={editingCategory.name}
                              onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                              className="bg-[#09090B] border-zinc-700 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-white">Color</Label>
                            <Input
                              type="color"
                              value={editingCategory.color}
                              onChange={(e) => setEditingCategory({ ...editingCategory, color: e.target.value })}
                              className="h-10 cursor-pointer"
                            />
                          </div>
                        </div>
                      )}
                      <DialogFooter>
                        <Button onClick={handleUpdateCategory} className="bg-[#FF4500] hover:bg-[#FF4500]/90">
                          Update Category
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (window.confirm('Delete this category?')) {
                        deleteCategory(category.id);
                        toast.success('Category deleted');
                      }
                    }}
                    className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                    data-testid={`button-delete-category-${category.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {categories.length === 0 && (
        <div className="text-center py-12 text-zinc-500">
          No categories created. Add your first category above.
        </div>
      )}
    </div>
  );
}
