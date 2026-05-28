import React, { useState, useEffect } from 'react';
import { useItems, useCreateItem, useDeleteItem, useUpdateItem } from '../hooks/useItems';
import { Plus, Trash2, Pencil, Search, PackageOpen, Sliders, Scale, MapPin, Box } from 'lucide-react';

export function Items() {
  const { data, isLoading } = useItems();
  const createItem = useCreateItem();
  const deleteItem = useDeleteItem();
  const updateItem = useUpdateItem();

  const [activeTab, setActiveTab] = useState<'items' | 'units' | 'locations'>('items');
  const [search, setSearch] = useState('');

  // 1. Part Numbers / Master Items Form & Edit State
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItem, setEditingItem] = useState<{ id: string; itemCode: string; itemName: string; unit: string } | null>(null);
  const [itemFormData, setItemFormData] = useState({ itemCode: '', itemName: '', unit: 'pcs' });

  // 2. Units Storage & Form & Edit State
  const [units, setUnits] = useState<string[]>([]);
  const [editingUnit, setEditingUnit] = useState<string | null>(null);
  const [newUnit, setNewUnit] = useState('');

  // 3. Locations Storage & Form & Edit State
  const [locations, setLocations] = useState<string[]>([]);
  const [editingLocation, setEditingLocation] = useState<string | null>(null);
  const [newLocation, setNewLocation] = useState('');

  // Load Units and Locations from localStorage on mount
  useEffect(() => {
    const storedUnits = localStorage.getItem('pdits_units');
    if (storedUnits) {
      try { setUnits(JSON.parse(storedUnits)); } catch (e) { setUnits(['pcs', 'kg', 'box', 'liters']); }
    } else {
      const defaultUnits = ['pcs', 'kg', 'box', 'liters'];
      setUnits(defaultUnits);
      localStorage.setItem('pdits_units', JSON.stringify(defaultUnits));
    }

    const storedLocations = localStorage.getItem('pdits_locations');
    if (storedLocations) {
      try { setLocations(JSON.parse(storedLocations)); } catch (e) { setLocations(['Line 1', 'Line 2', 'Assembly Line A', 'Assembly Line B', 'QC Area']); }
    } else {
      const defaultLocations = ['Line 1', 'Line 2', 'Assembly Line A', 'Assembly Line B', 'QC Area'];
      setLocations(defaultLocations);
      localStorage.setItem('pdits_locations', JSON.stringify(defaultLocations));
    }
  }, []);

  // Update localStorage when units or locations change
  const saveUnits = (newUnits: string[]) => {
    setUnits(newUnits);
    localStorage.setItem('pdits_units', JSON.stringify(newUnits));
  };

  const saveLocations = (newLocs: string[]) => {
    setLocations(newLocs);
    localStorage.setItem('pdits_locations', JSON.stringify(newLocs));
  };

  // CRUD for Part Numbers
  const items = data?.data || [];
  const filteredItems = items.filter(
    item => item.itemCode.toLowerCase().includes(search.toLowerCase()) || 
            item.itemName.toLowerCase().includes(search.toLowerCase())
  );

  const handleItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await updateItem.mutateAsync({
          id: editingItem.id,
          itemCode: itemFormData.itemCode,
          itemName: itemFormData.itemName,
          unit: itemFormData.unit
        });
        setEditingItem(null);
      } else {
        await createItem.mutateAsync(itemFormData);
      }
      setItemFormData({ itemCode: '', itemName: '', unit: units[0] || 'pcs' });
      setShowItemForm(false);
    } catch (err: any) {
      alert(err.message || 'Failed to save item');
    }
  };

  const handleItemDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this part number?')) {
      try {
        await deleteItem.mutateAsync(id);
      } catch (err: any) {
        alert(err.message || 'Failed to delete item');
      }
    }
  };

  // CRUD for Units
  const handleAddUnit = (e: React.FormEvent) => {
    e.preventDefault();
    const formattedUnit = newUnit.trim().toLowerCase();
    if (!formattedUnit) return;

    if (editingUnit) {
      if (formattedUnit !== editingUnit && units.includes(formattedUnit)) {
        alert('Unit already exists!');
        return;
      }
      const updated = units.map(u => u === editingUnit ? formattedUnit : u);
      saveUnits(updated);
      setEditingUnit(null);
    } else {
      if (units.includes(formattedUnit)) {
        alert('Unit already exists!');
        return;
      }
      const updated = [...units, formattedUnit];
      saveUnits(updated);
    }
    setNewUnit('');
  };

  const handleDeleteUnit = (unitToDelete: string) => {
    if (confirm(`Are you sure you want to delete unit "${unitToDelete}"?`)) {
      const updated = units.filter(u => u !== unitToDelete);
      saveUnits(updated);
    }
  };

  // CRUD for Locations
  const handleAddLocation = (e: React.FormEvent) => {
    e.preventDefault();
    const formattedLoc = newLocation.trim();
    if (!formattedLoc) return;

    if (editingLocation) {
      if (formattedLoc.toLowerCase() !== editingLocation.toLowerCase() && locations.some(l => l.toLowerCase() === formattedLoc.toLowerCase())) {
        alert('Location already exists!');
        return;
      }
      const updated = locations.map(l => l === editingLocation ? formattedLoc : l);
      saveLocations(updated);
      setEditingLocation(null);
    } else {
      if (locations.some(l => l.toLowerCase() === formattedLoc.toLowerCase())) {
        alert('Location already exists!');
        return;
      }
      const updated = [...locations, formattedLoc];
      saveLocations(updated);
    }
    setNewLocation('');
  };

  const handleDeleteLocation = (locToDelete: string) => {
    if (confirm(`Are you sure you want to delete location "${locToDelete}"?`)) {
      const updated = locations.filter(l => l !== locToDelete);
      saveLocations(updated);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading dropdown settings...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Sliders className="text-primary" size={24} /> Dropdown Management
        </h2>
        <p className="text-muted-foreground text-sm">Configure and manage dropdown options across the entire system catalog.</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border space-x-1 bg-muted/30 p-1 rounded-lg max-w-lg">
        <button
          onClick={() => { setActiveTab('items'); setSearch(''); setEditingItem(null); setEditingUnit(null); setEditingLocation(null); setShowItemForm(false); }}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'items'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
          }`}
        >
          <Box size={16} />
          <span>Part Numbers</span>
        </button>
        <button
          onClick={() => { setActiveTab('units'); setSearch(''); setEditingItem(null); setEditingUnit(null); setEditingLocation(null); }}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'units'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
          }`}
        >
          <Scale size={16} />
          <span>Measurement Units</span>
        </button>
        <button
          onClick={() => { setActiveTab('locations'); setSearch(''); setEditingItem(null); setEditingUnit(null); setEditingLocation(null); }}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'locations'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
          }`}
        >
          <MapPin size={16} />
          <span>WIP Locations</span>
        </button>
      </div>

      {/* Tab Contents: 1. Part Numbers (Items) */}
      {activeTab === 'items' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-lg">Part Numbers / Master Catalog</h3>
            <button 
              onClick={() => {
                setShowItemForm(!showItemForm);
                setEditingItem(null);
                setItemFormData({ itemCode: '', itemName: '', unit: units[0] || 'pcs' });
              }}
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md font-medium text-sm flex items-center space-x-2"
            >
              <Plus size={16} />
              <span>Add New Part</span>
            </button>
          </div>

          {showItemForm && (
            <div className="bg-card text-card-foreground border rounded-lg p-6 shadow-sm">
              <h4 className="font-semibold mb-4">{editingItem ? 'Edit Catalog Item' : 'Create New Catalog Item'}</h4>
              <form onSubmit={handleItemSubmit} className="flex flex-wrap items-end gap-4">
                <div className="flex-1 min-w-[200px] space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Item Code / Part Number</label>
                  <input 
                    type="text" 
                    required
                    className="w-full h-10 px-3 py-2 border rounded-md"
                    value={itemFormData.itemCode}
                    onChange={e => setItemFormData({...itemFormData, itemCode: e.target.value})}
                    placeholder="e.g. PROD-F006"
                  />
                </div>
                <div className="flex-1 min-w-[250px] space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Item Name</label>
                  <input 
                    type="text" 
                    required
                    className="w-full h-10 px-3 py-2 border rounded-md"
                    value={itemFormData.itemName}
                    onChange={e => setItemFormData({...itemFormData, itemName: e.target.value})}
                    placeholder="e.g. Component X"
                  />
                </div>
                <div className="w-32 space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Unit</label>
                  <select 
                    className="w-full h-10 px-3 py-2 border rounded-md bg-background"
                    value={itemFormData.unit}
                    onChange={e => setItemFormData({...itemFormData, unit: e.target.value})}
                  >
                    {units.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <button 
                  type="submit" 
                  disabled={createItem.isPending || updateItem.isPending}
                  className="h-10 bg-primary text-primary-foreground hover:bg-primary/90 px-4 rounded-md font-medium disabled:opacity-50 text-sm"
                >
                  {createItem.isPending || updateItem.isPending ? 'Saving...' : editingItem ? 'Update Item' : 'Save Item'}
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    setShowItemForm(false);
                    setEditingItem(null);
                    setItemFormData({ itemCode: '', itemName: '', unit: units[0] || 'pcs' });
                  }}
                  className="h-10 border hover:bg-secondary px-4 rounded-md font-medium text-sm"
                >
                  Cancel
                </button>
              </form>
            </div>
          )}

          <div className="bg-card text-card-foreground border rounded-lg shadow-sm overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between bg-secondary/30">
              <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <input 
                  type="text" 
                  placeholder="Search parts..." 
                  className="w-full h-9 pl-9 pr-4 text-sm border rounded-md bg-background"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <div className="text-sm text-muted-foreground">
                Total: {filteredItems.length} parts
              </div>
            </div>

            {filteredItems.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center text-muted-foreground">
                <PackageOpen size={48} className="mb-4 opacity-20" />
                <p>No catalog parts found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-secondary/50 text-muted-foreground uppercase text-xs font-medium">
                    <tr>
                      <th className="px-6 py-3 w-16">No</th>
                      <th className="px-6 py-3">Part Number</th>
                      <th className="px-6 py-3">Item Name</th>
                      <th className="px-6 py-3">Unit</th>
                      <th className="px-6 py-3 w-24 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredItems.map((item, index) => (
                      <tr key={item.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-6 py-4">{index + 1}</td>
                        <td className="px-6 py-4 font-medium">{item.itemCode}</td>
                        <td className="px-6 py-4">{item.itemName}</td>
                        <td className="px-6 py-4">
                          <span className="bg-secondary px-2 py-1 rounded text-xs">{item.unit}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setEditingItem(item);
                                setItemFormData({ itemCode: item.itemCode, itemName: item.itemName, unit: item.unit });
                                setShowItemForm(true);
                              }}
                              className="text-muted-foreground hover:text-primary p-1 rounded-md hover:bg-primary/10 transition-colors"
                              title="Edit part"
                            >
                              <Pencil size={16} />
                            </button>
                            <button 
                              onClick={() => handleItemDelete(item.id)}
                              disabled={deleteItem.isPending}
                              className="text-muted-foreground hover:text-destructive p-1 rounded-md hover:bg-destructive/10 transition-colors disabled:opacity-50"
                              title="Delete part"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab Contents: 2. Measurement Units */}
      {activeTab === 'units' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-card text-card-foreground border rounded-lg p-6 shadow-sm">
              <h3 className="font-semibold text-base mb-4">{editingUnit ? 'Edit Unit Option' : 'Add New Unit'}</h3>
              <form onSubmit={handleAddUnit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Unit Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. roll, pack, gram"
                    className="w-full h-10 px-3 py-2 border rounded-md bg-background"
                    value={newUnit}
                    onChange={e => setNewUnit(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="submit"
                    className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90 px-4 rounded-md font-medium text-sm flex items-center justify-center gap-2"
                  >
                    {editingUnit ? <Pencil size={16} /> : <Plus size={16} />}
                    <span>{editingUnit ? 'Update Unit Option' : 'Add Unit Option'}</span>
                  </button>
                  {editingUnit && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingUnit(null);
                        setNewUnit('');
                      }}
                      className="w-full h-10 border hover:bg-secondary rounded-md font-medium text-sm"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="bg-card text-card-foreground border rounded-lg shadow-sm overflow-hidden">
              <div className="p-4 border-b bg-secondary/30 flex justify-between items-center">
                <h4 className="font-semibold text-sm">Measurement Units dropdown list</h4>
                <span className="text-xs text-muted-foreground">{units.length} options active</span>
              </div>
              <div className="divide-y divide-border">
                {units.map((u, index) => (
                  <div key={u} className="px-6 py-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-6">{index + 1}</span>
                      <span className="font-medium bg-secondary px-2 py-1 rounded text-xs text-secondary-foreground">{u}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingUnit(u);
                          setNewUnit(u);
                        }}
                        className="text-muted-foreground hover:text-primary p-1 rounded-md hover:bg-primary/10 transition-colors"
                        title="Edit unit option"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteUnit(u)}
                        className="text-muted-foreground hover:text-destructive p-1 rounded-md hover:bg-destructive/10 transition-colors"
                        title="Delete unit option"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Contents: 3. WIP Locations */}
      {activeTab === 'locations' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-card text-card-foreground border rounded-lg p-6 shadow-sm">
              <h3 className="font-semibold text-base mb-4">{editingLocation ? 'Edit Location Option' : 'Add Production Location'}</h3>
              <form onSubmit={handleAddLocation} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Location Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Assembly Line C, Machine 05"
                    className="w-full h-10 px-3 py-2 border rounded-md bg-background"
                    value={newLocation}
                    onChange={e => setNewLocation(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="submit"
                    className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90 px-4 rounded-md font-medium text-sm flex items-center justify-center gap-2"
                  >
                    {editingLocation ? <Pencil size={16} /> : <Plus size={16} />}
                    <span>{editingLocation ? 'Update Location Option' : 'Add Location Option'}</span>
                  </button>
                  {editingLocation && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingLocation(null);
                        setNewLocation('');
                      }}
                      className="w-full h-10 border hover:bg-secondary rounded-md font-medium text-sm"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="bg-card text-card-foreground border rounded-lg shadow-sm overflow-hidden">
              <div className="p-4 border-b bg-secondary/30 flex justify-between items-center">
                <h4 className="font-semibold text-sm">WIP Production Locations dropdown list</h4>
                <span className="text-xs text-muted-foreground">{locations.length} options active</span>
              </div>
              <div className="divide-y divide-border">
                {locations.map((loc, index) => (
                  <div key={loc} className="px-6 py-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-6">{index + 1}</span>
                      <span className="font-medium">{loc}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingLocation(loc);
                          setNewLocation(loc);
                        }}
                        className="text-muted-foreground hover:text-primary p-1 rounded-md hover:bg-primary/10 transition-colors"
                        title="Edit location option"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteLocation(loc)}
                        className="text-muted-foreground hover:text-destructive p-1 rounded-md hover:bg-destructive/10 transition-colors"
                        title="Delete location option"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
