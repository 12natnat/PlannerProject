import React, { useState, useEffect } from 'react';
import { useWIPs, useUpsertWIP, useBulkUpsertWIP, useUpdateWIP, useDeleteWIP } from '../hooks/useWIP';
import { useItems, useCreateItem } from '../hooks/useItems';
import { SearchableSelect } from '../components/SearchableSelect';
import { Settings2, Plus, Save, Upload, Trash2, Search, Filter, Calendar, X, Edit2 } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

export function WIP() {
  const [showForm, setShowForm] = useState(false);
  
  const { data: wipData, isLoading: loadingWIP } = useWIPs();
  const { data: itemsData } = useItems();
  const createItem = useCreateItem();
  const upsertWIP = useUpsertWIP();
  const bulkUpsertWIP = useBulkUpsertWIP();

  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState<any[]>([]);
  const [importSearch, setImportSearch] = useState('');

  const [locations, setLocations] = useState<string[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('pdits_locations');
    if (stored) {
      try {
        setLocations(JSON.parse(stored));
      } catch (e) {
        setLocations(['Line 1', 'Line 2', 'Assembly Line A', 'Assembly Line B', 'QC Area']);
      }
    } else {
      setLocations(['Line 1', 'Line 2', 'Assembly Line A', 'Assembly Line B', 'QC Area']);
    }
  }, []);

  const [formData, setFormData] = useState({
    itemId: '',
    location: '',
    quantity: 0,
    progressPercent: 0,
    date: new Date().toISOString().split('T')[0],
    shift: 1,
    estimatedFinish: new Date(new Date().getTime() + 86400000).toISOString().split('T')[0],
    status: 'IN_PROGRESS',
    notes: '',
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedDate, setSelectedDate] = useState('');

  const wips = wipData?.data || [];
  const items = itemsData?.data || [];

  // Extract unique locations dynamically from current active WIP data
  const activeLocations = Array.from(new Set(wips.map((wip: any) => wip.location))).filter(Boolean) as string[];

  // Filter WIP data based on search, location, and date inputs
  const filteredWips = wips.filter((wip: any) => {
    // Search query matches part number or name
    const matchesSearch = 
      !searchQuery ||
      wip.item.itemCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      wip.item.itemName.toLowerCase().includes(searchQuery.toLowerCase());

    // Location matches selected filter option
    const matchesLocation = 
      !selectedLocation || wip.location === selectedLocation;

    // Date matches production date or estimated finish date
    const wipDateStr = wip.date ? wip.date.split('T')[0] : '';
    const wipEstFinishStr = wip.estimatedFinish ? wip.estimatedFinish.split('T')[0] : '';
    const targetDateStr = selectedDate;

    const matchesDate = 
      !selectedDate || 
      wipDateStr === targetDateStr || 
      wipEstFinishStr === targetDateStr;

    return matchesSearch && matchesLocation && matchesDate;
  });

  const itemOptions = items.map((item: any) => ({
    value: item.id,
    label: `${item.itemCode} - ${item.itemName}`
  }));

  const locationOptions = locations.map(loc => ({
    value: loc,
    label: loc
  }));

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws);
        
        const parsedRecords: any[] = [];
        data.forEach((row: any, index) => {
          const itemKey = Object.keys(row).find(k => k.trim().toLowerCase().includes('no toy')) || Object.keys(row)[1];
          const itemCode = String(row[itemKey] || '').trim();
          
          if (!itemCode) return;
          
          Object.keys(row).forEach(key => {
            const k = key.trim().toLowerCase();
            if (k !== 'no' && !k.includes('no toy') && !k.includes('total wip')) {
              const val = String(row[key]).trim();
              if (val !== '-' && val !== '') {
                const numVal = parseFloat(val);
                if (!isNaN(numVal)) {
                  parsedRecords.push({
                    id: `import-${index}-${key}`,
                    itemCode,
                    location: key.trim(),
                    quantity: numVal * 1000,
                    date: new Date().toISOString().split('T')[0]
                  });
                }
              }
            }
          });
        });
        
        setImportData(parsedRecords);
      } catch (err) {
        alert('Failed to parse file. Please make sure it is a valid Excel/CSV.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleBulkSubmit = async (saveMode: 'overwrite' | 'add') => {
    if (importData.length === 0) return;
    try {
      await bulkUpsertWIP.mutateAsync({
        records: importData,
        saveMode
      });
      setShowImportModal(false);
      setImportData([]);
    } catch (err: any) {
      alert(err.message || 'Failed to bulk import WIP');
    }
  };

  const updateWIP = useUpdateWIP();
  const deleteWIP = useDeleteWIP();

  const [editModal, setEditModal] = useState<{ isOpen: boolean; data: any }>({
    isOpen: false,
    data: null,
  });

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal.data) return;
    try {
      await updateWIP.mutateAsync({
        id: editModal.data.id,
        quantity: Number(editModal.data.quantity),
        progressPercent: Number(editModal.data.progressPercent),
        date: editModal.data.date,
        shift: Number(editModal.data.shift),
        estimatedFinish: editModal.data.estimatedFinish,
        status: editModal.data.status,
        notes: editModal.data.notes,
      });
      setEditModal({ isOpen: false, data: null });
    } catch (err: any) {
      alert(err.message || 'Failed to update WIP');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this record?')) return;
    try {
      await deleteWIP.mutateAsync(id);
    } catch (err: any) {
      alert(err.message || 'Failed to delete WIP');
    }
  };

  const handleSubmit = async (e: React.FormEvent | React.MouseEvent, saveMode: 'overwrite' | 'add') => {
    e.preventDefault();
    if (!formData.itemId || !formData.location) return;

    try {
      await upsertWIP.mutateAsync({
        ...formData,
        shift: Number(formData.shift),
        quantity: Number(formData.quantity),
        progressPercent: Number(formData.progressPercent),
        saveMode
      });
      setShowForm(false);
      setFormData(prev => ({ ...prev, itemId: '', quantity: 0, progressPercent: 0, notes: '' }));
    } catch (err: any) {
      alert(err.message || 'Failed to save WIP');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Work In Progress (WIP)</h2>
          <p className="text-muted-foreground text-sm">Manage items currently in production stages.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowImportModal(true)}
            className="bg-secondary text-secondary-foreground border hover:bg-secondary/80 px-4 py-2 rounded-md font-medium text-sm flex items-center space-x-2"
          >
            <Upload size={16} />
            <span>Import Data</span>
          </button>
          <button 
            onClick={() => setShowForm(!showForm)}
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md font-medium text-sm flex items-center space-x-2"
          >
            <Plus size={16} />
            <span>Update WIP Status</span>
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-card text-card-foreground border rounded-lg p-6 shadow-sm">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Settings2 size={18} /> Update Work In Progress
          </h3>
          <p className="text-xs text-muted-foreground mb-4">Note: Providing an update for the same Item + Location will OVERWRITE its current WIP data.</p>
          
          <form className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
            <div className="space-y-2 lg:col-span-2">
              <label className="text-sm font-medium">Part Number</label>
              <SearchableSelect
                options={itemOptions}
                value={formData.itemId}
                onChange={val => setFormData({...formData, itemId: val})}
                onAdd={async (search) => {
                  try {
                    const res = await createItem.mutateAsync({ itemCode: search, itemName: search, unit: 'PCS' }) as any;
                    if (res?.data?.id) {
                      setFormData(prev => ({...prev, itemId: res.data.id}));
                    }
                  } catch (e: any) {
                    alert(e.message || "Failed to create part number");
                  }
                }}
                placeholder="Select Part Number..."
              />
            </div>
            <div className="space-y-2 lg:col-span-2">
              <label className="text-sm font-medium">Location / Production Line</label>
              <SearchableSelect
                options={locationOptions}
                value={formData.location}
                onChange={val => setFormData({...formData, location: val})}
                onAdd={(search) => {
                  const newLocations = [...locations, search];
                  setLocations(newLocations);
                  localStorage.setItem('pdits_locations', JSON.stringify(newLocations));
                  setFormData(prev => ({...prev, location: search}));
                }}
                placeholder="Select Location..."
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Quantity</label>
              <input 
                type="number" required min="1"
                className="w-full h-10 px-3 border rounded-md bg-background"
                value={formData.quantity} onChange={e => setFormData({...formData, quantity: Number(e.target.value)})}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Current Date</label>
              <input 
                type="date" required
                className="w-full h-10 px-3 border rounded-md bg-background"
                value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Est. Finish Date</label>
              <input 
                type="date" required
                className="w-full h-10 px-3 border rounded-md bg-background"
                value={formData.estimatedFinish} onChange={e => setFormData({...formData, estimatedFinish: e.target.value})}
              />
            </div>

            <div className="space-y-2 lg:col-span-4">
              <label className="text-sm font-medium">Notes (Optional)</label>
              <input 
                type="text"
                placeholder="E.g. Waiting for part X, delayed due to machine error."
                className="w-full h-10 px-3 border rounded-md bg-background"
                value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})}
              />
            </div>

            <div className="lg:col-span-4 flex justify-end gap-3 mt-2">
              <button type="button" onClick={() => setShowForm(false)} className="h-10 border px-6 rounded-md font-medium hover:bg-muted">Cancel</button>
              <button type="button" onClick={(e) => handleSubmit(e, 'add')} disabled={upsertWIP.isPending} className="h-10 bg-green-600 hover:bg-green-700 text-white px-6 rounded-md font-medium flex items-center gap-2">
                <Plus size={16} /> {upsertWIP.isPending ? 'Saving...' : 'Save'}
              </button>
              <button type="button" onClick={(e) => handleSubmit(e, 'overwrite')} disabled={upsertWIP.isPending} className="h-10 bg-primary text-primary-foreground px-6 rounded-md font-medium flex items-center gap-2">
                <Save size={16} /> {upsertWIP.isPending ? 'Saving...' : 'Save Overwrite'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-card text-card-foreground border rounded-lg p-4 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        {/* Search Input */}
        <div className="relative w-full md:flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <input
            type="text"
            placeholder="Search by Part Number or Name..."
            className="w-full h-10 pl-10 pr-10 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Location Dropdown */}
        <div className="relative w-full md:w-64">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground flex items-center pointer-events-none">
            <Filter size={16} />
          </div>
          <select
            className="w-full h-10 pl-10 pr-8 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm appearance-none cursor-pointer"
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
          >
            <option value="">All Locations</option>
            {activeLocations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground flex items-center">
            <span className="text-xs">▼</span>
          </div>
        </div>

        {/* Date Filter */}
        <div className="relative w-full md:w-64">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground flex items-center pointer-events-none">
            <Calendar size={16} />
          </div>
          <input
            type="date"
            className="w-full h-10 pl-10 pr-10 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm cursor-pointer"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
          {selectedDate && (
            <button
              onClick={() => setSelectedDate('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Reset All */}
        {(searchQuery || selectedLocation || selectedDate) && (
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedLocation('');
              setSelectedDate('');
            }}
            className="w-full md:w-auto h-10 px-4 flex items-center justify-center gap-2 border border-red-200 dark:border-red-950/50 bg-red-50/50 dark:bg-red-950/10 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 text-sm font-medium rounded-md transition-colors"
          >
            <X size={16} />
            <span>Reset</span>
          </button>
        )}
      </div>

      <div className="bg-card text-card-foreground border rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-secondary/50 text-muted-foreground uppercase text-xs font-medium">
              <tr>
                <th className="px-6 py-3">Part Number</th>
                <th className="px-6 py-3">Location</th>
                <th className="px-6 py-3 text-right">Qty</th>
                <th className="px-6 py-3">Est. Finish</th>
                <th className="px-6 py-3">Updated By</th>
                <th className="px-6 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loadingWIP ? (
                <tr><td colSpan={6} className="p-8 text-center">Loading WIP data...</td></tr>
              ) : wips.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No active WIP recorded.</td></tr>
              ) : filteredWips.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No matching WIP records found for current filters.</td></tr>
              ) : (
                filteredWips.map((wip) => (
                  <tr key={wip.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-medium">{wip.item.itemCode}</td>
                    <td className="px-6 py-4">
                      <span className="bg-secondary px-2 py-1 rounded text-xs">{wip.location}</span>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-amber-500">{wip.quantity}</td>
                    <td className="px-6 py-4 text-xs">
                      {format(new Date(wip.estimatedFinish), 'dd MMM yyyy')}
                    </td>
                    <td className="px-6 py-4 text-xs text-muted-foreground">
                      {wip.user?.name || 'System'}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setEditModal({
                            isOpen: true,
                            data: {
                              id: wip.id,
                              itemCode: wip.item.itemCode,
                              itemName: wip.item.itemName,
                              location: wip.location,
                              quantity: wip.quantity,
                              progressPercent: wip.progressPercent,
                              date: wip.date.split('T')[0],
                              shift: wip.shift,
                              estimatedFinish: wip.estimatedFinish.split('T')[0],
                              status: wip.status,
                              notes: wip.notes || '',
                            }
                          })}
                          className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-md transition-colors"
                          title="Edit Record"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(wip.id)}
                          className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-md transition-colors"
                          title="Delete Record"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showImportModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card text-card-foreground border rounded-lg shadow-lg max-w-5xl w-full max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-xl font-bold flex items-center gap-2"><Upload size={20} /> Import WIP Data</h3>
              <button onClick={() => setShowImportModal(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            
            <div className="p-6 flex-1 overflow-auto space-y-4">
              <div className="flex items-center gap-4">
                <input 
                  type="file" 
                  accept=".xlsx, .xls, .csv" 
                  onChange={handleFileUpload} 
                  className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                />
              </div>

              {importData.length > 0 && (
                <>
                  <div className="flex justify-between items-center bg-muted/30 p-3 rounded-md">
                    <span className="font-medium text-sm">{importData.length} records loaded</span>
                    <div className="relative w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                      <input 
                        type="text" 
                        placeholder="Search loaded data..." 
                        className="w-full h-9 pl-9 pr-4 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                        value={importSearch}
                        onChange={e => setImportSearch(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="border rounded-md overflow-hidden max-h-[50vh] overflow-y-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-muted text-muted-foreground text-xs uppercase font-medium sticky top-0 shadow-sm">
                        <tr>
                          <th className="px-4 py-3">Part Number</th>
                          <th className="px-4 py-3">Location / Line</th>
                          <th className="px-4 py-3 text-right">Quantity</th>
                          <th className="px-4 py-3 text-center w-20">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {importData.filter(d => d.itemCode.toLowerCase().includes(importSearch.toLowerCase()) || d.location.toLowerCase().includes(importSearch.toLowerCase())).map((row) => (
                          <tr key={row.id} className="hover:bg-muted/50">
                            <td className="px-4 py-2 font-medium">{row.itemCode}</td>
                            <td className="px-4 py-2"><span className="bg-secondary px-2 py-1 rounded text-xs">{row.location}</span></td>
                            <td className="px-4 py-2 text-right">
                              <input 
                                type="number" 
                                className="w-24 h-8 px-2 border rounded text-right bg-background"
                                value={row.quantity}
                                onChange={e => {
                                  const newData = [...importData];
                                  const targetIndex = importData.findIndex(r => r.id === row.id);
                                  newData[targetIndex].quantity = Number(e.target.value);
                                  setImportData(newData);
                                }}
                              />
                            </td>
                            <td className="px-4 py-2 text-center">
                              <button 
                                onClick={() => setImportData(importData.filter(r => r.id !== row.id))}
                                className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-md transition-colors title='Delete Record'"
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
            
            <div className="p-6 border-t flex justify-end gap-3 bg-muted/10">
              <button 
                onClick={() => setShowImportModal(false)}
                className="h-10 border px-6 rounded-md font-medium hover:bg-muted text-sm"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleBulkSubmit('add')} 
                disabled={bulkUpsertWIP.isPending || importData.length === 0} 
                className="h-10 bg-green-600 hover:bg-green-700 text-white px-6 rounded-md font-medium flex items-center gap-2 disabled:opacity-50 text-sm"
              >
                <Plus size={16} /> {bulkUpsertWIP.isPending ? 'Saving...' : 'Save (Add)'}
              </button>
              <button 
                onClick={() => handleBulkSubmit('overwrite')} 
                disabled={bulkUpsertWIP.isPending || importData.length === 0} 
                className="h-10 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white px-6 rounded-md font-medium flex items-center gap-2 disabled:opacity-50 text-sm"
              >
                <Save size={16} /> {bulkUpsertWIP.isPending ? 'Saving...' : 'Save Overwrite'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Edit Modal */}
      {editModal.isOpen && editModal.data && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card text-card-foreground border rounded-lg shadow-lg max-w-2xl w-full p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold">Edit WIP Record</h3>
              <button 
                type="button" 
                onClick={() => setEditModal({ isOpen: false, data: null })}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-muted-foreground">Item & Location</label>
                  <div className="font-semibold">{editModal.data.itemCode} - {editModal.data.itemName} <span className="mx-2 text-muted-foreground">|</span> {editModal.data.location}</div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Quantity</label>
                  <input 
                    type="number" required min="1"
                    className="w-full h-10 px-3 border rounded-md bg-background"
                    value={editModal.data.quantity} onChange={e => setEditModal(prev => ({...prev, data: {...prev.data, quantity: Number(e.target.value)}}))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Progress %</label>
                  <input 
                    type="number" required min="0" max="100"
                    className="w-full h-10 px-3 border rounded-md bg-background"
                    value={editModal.data.progressPercent} onChange={e => setEditModal(prev => ({...prev, data: {...prev.data, progressPercent: Number(e.target.value)}}))}
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Date Recorded</label>
                  <input 
                    type="date" required
                    className="w-full h-10 px-3 border rounded-md bg-background"
                    value={editModal.data.date} onChange={e => setEditModal(prev => ({...prev, data: {...prev.data, date: e.target.value}}))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Shift</label>
                  <select 
                    className="w-full h-10 px-3 border rounded-md bg-background"
                    value={editModal.data.shift} onChange={e => setEditModal(prev => ({...prev, data: {...prev.data, shift: Number(e.target.value)}}))}
                  >
                    <option value={1}>Shift 1</option>
                    <option value={2}>Shift 2</option>
                    <option value={3}>Shift 3</option>
                  </select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Est. Finish Date</label>
                  <input 
                    type="date" required
                    className="w-full h-10 px-3 border rounded-md bg-background"
                    value={editModal.data.estimatedFinish} onChange={e => setEditModal(prev => ({...prev, data: {...prev.data, estimatedFinish: e.target.value}}))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <select 
                    className="w-full h-10 px-3 border rounded-md bg-background"
                    value={editModal.data.status} onChange={e => setEditModal(prev => ({...prev, data: {...prev.data, status: e.target.value}}))}
                  >
                    <option value="IN_PROGRESS">IN PROGRESS</option>
                    <option value="ON_HOLD">ON HOLD</option>
                    <option value="DELAYED">DELAYED</option>
                    <option value="COMPLETED">COMPLETED</option>
                  </select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium">Notes</label>
                  <input 
                    type="text"
                    className="w-full h-10 px-3 border rounded-md bg-background"
                    value={editModal.data.notes} onChange={e => setEditModal(prev => ({...prev, data: {...prev.data, notes: e.target.value}}))}
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button type="button" onClick={() => setEditModal({ isOpen: false, data: null })} className="h-10 border px-4 rounded-md font-medium hover:bg-muted transition-colors">Cancel</button>
                <button type="submit" disabled={updateWIP.isPending} className="h-10 bg-primary text-primary-foreground hover:bg-primary/90 px-4 rounded-md font-medium flex items-center gap-2 transition-colors">
                  <Save size={16} /> {updateWIP.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
