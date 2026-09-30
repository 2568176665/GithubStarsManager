import React, { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Modal } from './Modal';
import type { AssetFilter } from '../types';

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  filter?: AssetFilter;
  onSave: (filter: AssetFilter) => void;
}

const addUnique = (values: string[], value: string) => {
  const trimmed = value.trim();
  return trimmed && !values.some(item => item.toLocaleLowerCase() === trimmed.toLocaleLowerCase())
    ? [...values, trimmed]
    : values;
};

const ListEditor: React.FC<{
  label: string;
  placeholder: string;
  values: string[];
  onChange: (values: string[]) => void;
}> = ({ label, placeholder, values, onChange }) => {
  const [value, setValue] = useState('');
  const add = () => {
    const next = addUnique(values, value);
    if (next !== values) setValue('');
    onChange(next);
  };
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-foreground dark:text-foreground">{label}</label>
      <div className="mb-2 flex space-x-2">
        <Input
          value={value}
          onChange={event => setValue(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button type="button" onClick={add} disabled={!value.trim()} aria-label={`添加${label}`}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {values.map((item, index) => (
            <div key={`${item}-${index}`} className="flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1">
              <Badge variant="secondary" className="h-auto border-0 bg-transparent px-0">{item}</Badge>
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))} aria-label={`删除${label} ${item}`}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const FilterModal: React.FC<FilterModalProps> = ({ isOpen, onClose, filter, onSave }) => {
  const [name, setName] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [excludeKeywords, setExcludeKeywords] = useState<string[]>([]);
  const [includeRepos, setIncludeRepos] = useState<string[]>([]);
  const [alwaysExcludeRepos, setAlwaysExcludeRepos] = useState<string[]>([]);

  useEffect(() => {
    setName(filter?.name ?? '');
    setKeywords([...(filter?.keywords ?? [])]);
    setExcludeKeywords([...(filter?.excludeKeywords ?? [])]);
    setIncludeRepos([...(filter?.includeRepos ?? [])]);
    setAlwaysExcludeRepos([...(filter?.alwaysExcludeRepos ?? [])]);
  }, [filter, isOpen]);

  const handleSave = () => {
    if (!name.trim() || (keywords.length === 0 && excludeKeywords.length === 0 && includeRepos.length === 0 && alwaysExcludeRepos.length === 0)) return;
    const savedFilter: AssetFilter = {
      id: filter?.id || Date.now().toString(),
      name: name.trim(),
      keywords: keywords.map(item => item.trim()).filter(Boolean),
      ...(excludeKeywords.length ? { excludeKeywords } : {}),
      ...(includeRepos.length ? { includeRepos } : {}),
      ...(alwaysExcludeRepos.length ? { alwaysExcludeRepos } : {}),
      ...(filter?.isPreset ? { isPreset: true } : {}),
      ...(filter?.icon ? { icon: filter.icon } : {}),
    };
    onSave(savedFilter);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={filter ? '编辑过滤器' : '新建过滤器'}>
      <div className="space-y-5">
        <div>
          <label htmlFor="filter-name" className="mb-2 block text-sm font-medium">过滤器名称</label>
          <Input id="filter-name" value={name} onChange={event => setName(event.target.value)} placeholder="例如: macOS" />
        </div>

        <section className="space-y-4 rounded-lg border border-border p-3">
          <h3 className="text-sm font-semibold">Assets / 资源</h3>
          <ListEditor label="包含关键词" placeholder="例如: mac, dmg" values={keywords} onChange={setKeywords} />
          <ListEditor label="排除关键词" placeholder="例如: debug, source" values={excludeKeywords} onChange={setExcludeKeywords} />
        </section>

        <section className="space-y-4 rounded-lg border border-border p-3">
          <h3 className="text-sm font-semibold">Repositories / 仓库</h3>
          <ListEditor label="仅匹配仓库" placeholder="owner/repository" values={includeRepos} onChange={setIncludeRepos} />
          <ListEditor label="始终排除仓库" placeholder="owner/repository" values={alwaysExcludeRepos} onChange={setAlwaysExcludeRepos} />
        </section>

        <p className="rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">
          可只填写仓库规则或排除关键词；多个过滤器之间使用 OR 关系。仓库排除规则优先级最高。
        </p>

        <div className="flex justify-end space-x-3 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="button" onClick={handleSave} disabled={!name.trim() || (keywords.length === 0 && excludeKeywords.length === 0 && includeRepos.length === 0 && alwaysExcludeRepos.length === 0)}>
            {filter ? '保存' : '创建'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
