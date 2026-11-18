import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArrowLeft,
  Boxes,
  Edit3,
  History,
  Package,
  Plus,
  Search,
  Wrench,
} from 'lucide-react';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Panel,
  Skeleton,
} from '@/components/ui/primitives';
import { useToasts } from '@/components/ui/use-toasts';
import { getCurrentUser } from '@/features/auth/auth-api';
import {
  archiveCategory,
  archiveProduct,
  createCategory,
  createProduct,
  fetchCategories,
  fetchProductHistory,
  fetchProducts,
  setProductStatus,
  updateCategory,
  updateProduct,
  type Category,
  type CategoryKind,
  type Product,
  type ProductInput,
  type ProductKind,
} from './catalogue-api';
import {
  categoryFormSchema,
  paiseToRupees,
  productFormSchema,
  rupeesToPaise,
} from './catalogue-schemas';

type WorkspaceRole = 'ADMIN' | 'EMPLOYEE';
type Tab = 'products' | 'categories';

function money(paise: number) {
  const value = BigInt(paise);
  const rupees = Number(value / 100n);
  const coins = (value % 100n).toString().padStart(2, '0');
  return `${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(rupees)}.${coins}`;
}

function dateLabel(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(
        date,
      );
}

function productCategoryKind(kind: ProductKind): CategoryKind {
  return kind === 'PHYSICAL' ? 'PRODUCT' : 'SERVICE';
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalogue-modal-title"
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-7"
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 id="catalogue-modal-title" className="text-xl font-bold text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg px-3 py-1 text-slate-500 hover:bg-slate-100"
          >
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function ProductEditor({
  product,
  categories,
  onClose,
  onSave,
}: {
  product?: Product;
  categories: Category[];
  onClose: () => void;
  onSave: (input: ProductInput, product?: Product) => Promise<void>;
}) {
  const [name, setName] = useState(product?.name ?? '');
  const [kind, setKind] = useState<ProductKind>(product?.kind ?? 'PHYSICAL');
  const [categoryId, setCategoryId] = useState(product?.category?.id ?? product?.categoryId ?? '');
  const [sku, setSku] = useState(product?.sku ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? '');
  const [purchasePrice, setPurchasePrice] = useState(paiseToRupees(product?.purchasePricePaise));
  const [sellingPrice, setSellingPrice] = useState(paiseToRupees(product?.sellingPricePaise));
  const [stockQuantity, setStockQuantity] = useState(
    product?.stockQuantity === undefined ? '' : String(product.stockQuantity),
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const parsed = productFormSchema.safeParse({
      name,
      kind,
      categoryId,
      sku,
      description,
      imageUrl,
      purchasePrice,
      sellingPrice,
      stockQuantity,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the product details and try again.');
      return;
    }
    try {
      setSaving(true);
      const values = parsed.data;
      await onSave(
        {
          name: values.name,
          kind: values.kind,
          categoryId: values.categoryId || null,
          ...(values.sku ? { sku: values.sku } : {}),
          description: values.description || null,
          imageUrl: values.imageUrl || null,
          purchasePricePaise: rupeesToPaise(values.purchasePrice),
          sellingPricePaise: rupeesToPaise(values.sellingPrice),
          ...(values.kind === 'PHYSICAL' ? { stockQuantity: Number(values.stockQuantity) } : {}),
        },
        product,
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Product could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  const activeCategories = categories.filter(
    (category) => category.status === 'ACTIVE' && category.kind === productCategoryKind(kind),
  );

  return (
    <Modal title={product ? 'Edit catalogue item' : 'Add catalogue item'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={160}
            required
          />
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            <span>Type</span>
            <select
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as ProductKind);
                setStockQuantity('');
                setCategoryId('');
              }}
              className="field w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm"
            >
              <option value="PHYSICAL">Physical product</option>
              <option value="SERVICE">Service</option>
            </select>
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            <span>Category</span>
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="field w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm"
            >
              <option value="">No category</option>
              {activeCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="SKU (optional)"
            value={sku}
            onChange={(event) => setSku(event.target.value)}
            maxLength={64}
          />
          <Field
            label="Purchase price (₹)"
            inputMode="decimal"
            value={purchasePrice}
            onChange={(event) => setPurchasePrice(event.target.value)}
            placeholder="0.00"
            required
          />
          <Field
            label="Selling price (₹)"
            inputMode="decimal"
            value={sellingPrice}
            onChange={(event) => setSellingPrice(event.target.value)}
            placeholder="0.00"
            required
          />
          {kind === 'PHYSICAL' && (
            <Field
              label="Stock quantity"
              inputMode="numeric"
              value={stockQuantity}
              onChange={(event) => setStockQuantity(event.target.value)}
              placeholder="0"
              required
            />
          )}
          <Field
            label="Image URL (HTTPS)"
            type="url"
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
            placeholder="https://example.com/product.jpg"
          />
        </div>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          <span>Description</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2_000}
            rows={3}
            className="field w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm"
          />
        </label>
        {imageUrl && /^https:\/\//i.test(imageUrl) && (
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
            <img src={imageUrl} alt="Product preview" className="size-14 rounded-lg object-cover" />
            <span className="text-xs text-slate-500">
              Image preview from the supplied HTTPS URL
            </span>
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : product ? 'Save changes' : 'Create item'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CategoryEditor({
  category,
  onClose,
  onSave,
}: {
  category?: Category;
  onClose: () => void;
  onSave: (value: { name: string; kind: CategoryKind }, category?: Category) => Promise<void>;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [kind, setKind] = useState<CategoryKind>(category?.kind ?? 'PRODUCT');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = categoryFormSchema.safeParse({ name, kind });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a category name.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(parsed.data, category);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Category could not be saved.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal title={category ? 'Edit category' : 'Add category'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Category name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
          required
        />
        {!category && (
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            <span>Applies to</span>
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as CategoryKind)}
              className="field w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm"
            >
              <option value="PRODUCT">Physical products</option>
              <option value="SERVICE">Services</option>
            </select>
          </label>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : category ? 'Save changes' : 'Create category'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function CataloguePage({ role }: { role: WorkspaceRole }) {
  const client = useQueryClient();
  const { show, view } = useToasts();
  const [tab, setTab] = useState<Tab>('products');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('ALL');
  const [status, setStatus] = useState('ACTIVE');
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  const [productEditor, setProductEditor] = useState<Product | 'new' | null>(null);
  const [categoryEditor, setCategoryEditor] = useState<Category | 'new' | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    run: () => void;
  } | null>(null);

  const session = useQuery({
    queryKey: ['auth', 'catalogue-session'],
    queryFn: getCurrentUser,
    enabled: role === 'EMPLOYEE',
    staleTime: 30_000,
  });
  const permissions = session.data?.permissions ?? [];
  const canRead = role === 'ADMIN' || permissions.includes('products:read');
  const canCreate = role === 'ADMIN' || permissions.includes('products:create');
  const canUpdate = role === 'ADMIN' || permissions.includes('products:update');
  const canArchive = role === 'ADMIN' || permissions.includes('products:archive');
  const canManageCategories = role === 'ADMIN' || permissions.includes('categories:manage');

  const productList = useQuery({
    queryKey: ['catalogue', 'products', search, kind, status, categoryId, page],
    queryFn: () => fetchProducts({ q: search, kind, status, categoryId, page }),
    enabled: canRead && tab === 'products',
  });
  const categories = useQuery({
    queryKey: ['catalogue', 'categories'],
    queryFn: () => fetchCategories({ page: 1, limit: 100 }),
    enabled: canRead,
  });
  const categoryList = useQuery({
    queryKey: ['catalogue', 'category-list', search, kind, status, page],
    queryFn: () =>
      fetchCategories({
        q: search,
        kind: kind === 'ALL' ? undefined : kind === 'PHYSICAL' ? 'PRODUCT' : (kind as CategoryKind),
        status: status === 'ACTIVE' || status === 'ARCHIVED' ? status : undefined,
        page,
        limit: 20,
      }),
    enabled: canRead && tab === 'categories',
  });

  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ['catalogue'] });
  };
  const productMutation = useMutation({
    mutationFn: ({ input, product }: { input: ProductInput; product?: Product }) =>
      product ? updateProduct(product.id, input) : createProduct(input),
    onSuccess: (_data, variables) => {
      invalidate();
      show(variables.product ? 'Catalogue item updated.' : 'Catalogue item created.', 'success');
      setProductEditor(null);
    },
    onError: (error) =>
      show(error instanceof Error ? error.message : 'Catalogue item could not be saved.', 'error'),
  });
  const statusMutation = useMutation({
    mutationFn: ({ product, next }: { product: Product; next: 'ACTIVE' | 'INACTIVE' }) =>
      setProductStatus(product.id, next),
    onSuccess: () => {
      invalidate();
      show('Product status updated.', 'success');
    },
    onError: (error) =>
      show(error instanceof Error ? error.message : 'Status could not be updated.', 'error'),
  });
  const archiveProductMutation = useMutation({
    mutationFn: archiveProduct,
    onSuccess: () => {
      invalidate();
      show('Catalogue item archived.', 'success');
      setConfirm(null);
    },
    onError: (error) => {
      show(error instanceof Error ? error.message : 'Item could not be archived.', 'error');
      setConfirm(null);
    },
  });
  const categoryMutation = useMutation({
    mutationFn: ({
      values,
      category,
    }: {
      values: { name: string; kind: CategoryKind };
      category?: Category;
    }) => (category ? updateCategory(category.id, { name: values.name }) : createCategory(values)),
    onSuccess: (_data, variables) => {
      invalidate();
      show(variables.category ? 'Category updated.' : 'Category created.', 'success');
      setCategoryEditor(null);
    },
    onError: (error) =>
      show(error instanceof Error ? error.message : 'Category could not be saved.', 'error'),
  });
  const archiveCategoryMutation = useMutation({
    mutationFn: archiveCategory,
    onSuccess: () => {
      invalidate();
      show('Category archived.', 'success');
      setConfirm(null);
    },
    onError: (error) => {
      show(error instanceof Error ? error.message : 'Category could not be archived.', 'error');
      setConfirm(null);
    },
  });

  function changeFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(1);
  }

  return (
    <div className="min-h-screen bg-[#F5F5F6] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4 sm:px-7">
          <Link
            to={`/${role.toLowerCase()}`}
            aria-label="Back to dashboard"
            className="rounded-xl p-2 text-slate-600 hover:bg-slate-100"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="grid size-10 place-items-center rounded-xl bg-[#111111] text-white">
            <Package size={19} />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-900">Products & services</h1>
            <p className="text-xs text-slate-500">Catalogue management · INR</p>
          </div>
          {canRead && tab === 'products' && canCreate && (
            <Button className="ml-auto" onClick={() => setProductEditor('new')}>
              <Plus size={16} /> Add item
            </Button>
          )}
          {canRead && tab === 'categories' && canManageCategories && (
            <Button className="ml-auto" onClick={() => setCategoryEditor('new')}>
              <Plus size={16} /> Add category
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-7 sm:py-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[#C8102E]">CATALOGUE</p>
            <h2 className="mt-1 text-2xl font-bold">Manage what your business offers</h2>
            <p className="mt-1 text-sm text-slate-500">
              Prices are stored in paise. Existing invoice descriptions and prices remain snapshots.
            </p>
          </div>
          <div className="flex rounded-xl border border-slate-200 bg-white p-1">
            {(['products', 'categories'] as const).map((item) => (
              <button
                key={item}
                onClick={() => {
                  setTab(item);
                  if (item === 'categories' && status === 'INACTIVE') setStatus('ALL');
                  setPage(1);
                }}
                className={`rounded-lg px-4 py-2 text-sm font-semibold capitalize ${tab === item ? 'bg-[#111111] text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {role === 'EMPLOYEE' && session.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-12" />
            <Skeleton className="h-64" />
          </div>
        ) : !canRead ? (
          <Panel>
            <EmptyState
              title="Catalogue access is restricted"
              description="Your account does not have permission to view products and services."
            />
          </Panel>
        ) : (
          <>
            <Panel className="mb-4 p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="relative block">
                  <span className="sr-only">Search catalogue</span>
                  <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => changeFilter(setSearch, event.target.value)}
                    placeholder={
                      tab === 'products' ? 'Search name, SKU, description' : 'Search category'
                    }
                    className="field w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm"
                  />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-600">
                  <span>Type</span>
                  <select
                    value={kind}
                    onChange={(event) => changeFilter(setKind, event.target.value)}
                    className="field w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                  >
                    <option value="ALL">All types</option>
                    <option value="PHYSICAL">Physical product</option>
                    <option value="SERVICE">Service</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-600">
                  <span>Status</span>
                  <select
                    value={status}
                    onChange={(event) => changeFilter(setStatus, event.target.value)}
                    className="field w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                  >
                    {tab === 'products' ? (
                      <>
                        <option value="ALL">All statuses</option>
                        <option value="ACTIVE">Active</option>
                        <option value="INACTIVE">Inactive</option>
                        <option value="ARCHIVED">Archived</option>
                      </>
                    ) : (
                      <>
                        <option value="ALL">All statuses</option>
                        <option value="ACTIVE">Active</option>
                        <option value="ARCHIVED">Archived</option>
                      </>
                    )}
                  </select>
                </label>
                {tab === 'products' ? (
                  <label className="space-y-1 text-sm font-medium text-slate-600">
                    <span>Category</span>
                    <select
                      value={categoryId}
                      onChange={(event) => changeFilter(setCategoryId, event.target.value)}
                      className="field w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                    >
                      <option value="">All categories</option>
                      {(categories.data?.items ?? [])
                        .filter((item) => item.status === 'ACTIVE')
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : (
                  <div className="hidden lg:block" />
                )}
              </div>
            </Panel>

            {tab === 'products' ? (
              <ProductTable
                query={productList}
                canUpdate={canUpdate}
                canArchive={canArchive}
                onEdit={(product) => setProductEditor(product)}
                onHistory={setHistoryProduct}
                onStatus={(product, next) => statusMutation.mutate({ product, next })}
                onArchive={(product) =>
                  setConfirm({
                    title: 'Archive catalogue item?',
                    description: `${product.name} will be archived and kept for history. Existing invoice snapshots will not change.`,
                    run: () => archiveProductMutation.mutate(product.id),
                  })
                }
                page={page}
                setPage={setPage}
              />
            ) : (
              <CategoryTable
                query={categoryList}
                canManage={canManageCategories}
                onEdit={(category) => setCategoryEditor(category)}
                onArchive={(category) =>
                  setConfirm({
                    title: 'Archive category?',
                    description: `${category.name} can only be archived when no non-archived products use it.`,
                    run: () => archiveCategoryMutation.mutate(category.id),
                  })
                }
                page={page}
                setPage={setPage}
              />
            )}
          </>
        )}
      </main>

      {productEditor && (
        <ProductEditor
          key={productEditor === 'new' ? 'new-product' : productEditor.id}
          product={productEditor === 'new' ? undefined : productEditor}
          categories={categories.data?.items ?? []}
          onClose={() => setProductEditor(null)}
          onSave={async (input, product) => {
            await productMutation.mutateAsync({ input, product });
          }}
        />
      )}
      {categoryEditor && (
        <CategoryEditor
          key={categoryEditor === 'new' ? 'new-category' : categoryEditor.id}
          category={categoryEditor === 'new' ? undefined : categoryEditor}
          onClose={() => setCategoryEditor(null)}
          onSave={async (values, category) => {
            await categoryMutation.mutateAsync({ values, category });
          }}
        />
      )}
      {historyProduct && (
        <HistoryModal product={historyProduct} onClose={() => setHistoryProduct(null)} />
      )}
      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)}>
          <p className="text-sm leading-6 text-slate-600">{confirm.description}</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirm.run}>
              Confirm archive
            </Button>
          </div>
        </Modal>
      )}
      {view}
    </div>
  );
}

function ProductTable({
  query,
  canUpdate,
  canArchive,
  onEdit,
  onHistory,
  onStatus,
  onArchive,
  page,
  setPage,
}: {
  query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof fetchProducts>>>>;
  canUpdate: boolean;
  canArchive: boolean;
  onEdit: (product: Product) => void;
  onHistory: (product: Product) => void;
  onStatus: (product: Product, next: 'ACTIVE' | 'INACTIVE') => void;
  onArchive: (product: Product) => void;
  page: number;
  setPage: (value: number | ((current: number) => number)) => void;
}) {
  if (query.isLoading)
    return (
      <div className="space-y-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-72" />
      </div>
    );
  if (query.isError) return <ErrorState retry={() => void query.refetch()} />;
  const data = query.data!;
  return (
    <Panel className="overflow-hidden">
      {data.items.length === 0 ? (
        <EmptyState
          title="No catalogue items found"
          description="Add a product or service, or adjust your search and filters."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[950px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Type / category</th>
                <th className="px-4 py-3 text-right">Purchase</th>
                <th className="px-4 py-3 text-right">Selling</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((product) => (
                <tr key={product.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt=""
                          className="size-10 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="grid size-10 place-items-center rounded-lg bg-red-50 text-[#C8102E]">
                          {product.kind === 'SERVICE' ? <Wrench size={17} /> : <Boxes size={17} />}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-slate-900">{product.name}</p>
                        <p className="text-xs text-slate-500">
                          {product.sku || 'No SKU'}
                          {product.description ? ` · ${product.description}` : ''}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">
                      {product.kind === 'PHYSICAL' ? 'Physical product' : 'Service'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {product.category?.name ?? 'Uncategorized'}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {money(product.purchasePricePaise)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {money(product.sellingPricePaise)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {product.kind === 'PHYSICAL' ? product.stockQuantity : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        product.status === 'ACTIVE'
                          ? 'green'
                          : product.status === 'INACTIVE'
                            ? 'amber'
                            : 'slate'
                      }
                    >
                      {product.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {canUpdate && product.status !== 'ARCHIVED' && (
                        <>
                          <Button
                            variant="ghost"
                            className="min-h-9 px-2"
                            aria-label={`Edit ${product.name}`}
                            onClick={() => onEdit(product)}
                          >
                            <Edit3 size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            className="min-h-9 px-2"
                            onClick={() =>
                              onStatus(product, product.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')
                            }
                          >
                            {product.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                          </Button>
                        </>
                      )}
                      {canArchive && product.status !== 'ARCHIVED' && (
                        <Button
                          variant="ghost"
                          className="min-h-9 px-2 text-danger"
                          aria-label={`Archive ${product.name}`}
                          onClick={() => onArchive(product)}
                        >
                          <Archive size={16} />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        className="min-h-9 px-2"
                        aria-label={`History for ${product.name}`}
                        onClick={() => onHistory(product)}
                      >
                        <History size={16} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.pagination.pages > 1 && (
        <Pagination
          page={page}
          pages={data.pagination.pages}
          total={data.pagination.total}
          onPage={setPage}
        />
      )}
    </Panel>
  );
}

function CategoryTable({
  query,
  canManage,
  onEdit,
  onArchive,
  page,
  setPage,
}: {
  query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof fetchCategories>>>>;
  canManage: boolean;
  onEdit: (category: Category) => void;
  onArchive: (category: Category) => void;
  page: number;
  setPage: (value: number | ((current: number) => number)) => void;
}) {
  if (query.isLoading)
    return (
      <div className="space-y-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-64" />
      </div>
    );
  if (query.isError) return <ErrorState retry={() => void query.refetch()} />;
  const data = query.data!;
  return (
    <Panel className="overflow-hidden">
      {data.items.length === 0 ? (
        <EmptyState
          title="No categories found"
          description="Create categories to organize products and services."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Applies to</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((category) => (
                <tr key={category.id}>
                  <td className="px-5 py-4 font-semibold">{category.name}</td>
                  <td className="px-5 py-4 text-slate-600">
                    {category.kind === 'PRODUCT' ? 'Physical products' : 'Services'}
                  </td>
                  <td className="px-5 py-4">
                    <Badge tone={category.status === 'ACTIVE' ? 'green' : 'slate'}>
                      {category.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      {canManage && category.status === 'ACTIVE' && (
                        <>
                          <Button
                            variant="secondary"
                            className="min-h-9 px-3"
                            onClick={() => onEdit(category)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            className="min-h-9 px-3 text-danger"
                            onClick={() => onArchive(category)}
                          >
                            Archive
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.pagination.pages > 1 && (
        <Pagination
          page={page}
          pages={data.pagination.pages}
          total={data.pagination.total}
          onPage={setPage}
        />
      )}
    </Panel>
  );
}

function Pagination({
  page,
  pages,
  total,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (value: number | ((current: number) => number)) => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
      <span>
        {total} record{total === 1 ? '' : 's'}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          disabled={page <= 1}
          onClick={() => onPage((value) => value - 1)}
        >
          Previous
        </Button>
        <span>
          Page {page} of {pages}
        </span>
        <Button
          variant="secondary"
          disabled={page >= pages}
          onClick={() => onPage((value) => value + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function HistoryModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const history = useQuery({
    queryKey: ['catalogue', 'history', product.id],
    queryFn: () => fetchProductHistory(product.id),
  });
  return (
    <Modal title={`${product.name} history`} onClose={onClose}>
      {history.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : history.isError ? (
        <ErrorState retry={() => void history.refetch()} />
      ) : !history.data?.items.length ? (
        <EmptyState
          title="No history recorded"
          description="Changes to this catalogue item will appear here."
        />
      ) : (
        <div className="space-y-3">
          {history.data.items.map((entry, index) => (
            <details
              key={String(entry._id ?? index)}
              className="rounded-xl border border-slate-200 p-4"
            >
              <summary className="cursor-pointer font-semibold text-slate-800">
                {String(entry.action ?? 'Catalogue change').replaceAll('_', ' ')}{' '}
                <span className="ml-2 text-xs font-normal text-slate-500">
                  {dateLabel(String(entry.createdAt ?? ''))}
                </span>
              </summary>
              <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                {JSON.stringify(entry.metadata ?? {}, null, 2)}
              </pre>
            </details>
          ))}
        </div>
      )}
    </Modal>
  );
}
