import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { PackageSearch, UserX } from 'lucide-react'

const API_BASE = 'https://app.tablecrm.com/api/v1'

type ApiListResponse<T> = {
  count?: number
  result?: T[]
}

type NamedEntity = { id: number; name?: string; short_name?: string }
type Contragent = { id: number; name: string; phone?: string }
type NomenclaturePrice = { price: number; price_type?: number | string }
type Nomenclature = {
  id: number
  name: string
  unit?: number | null
  unit_name?: string | null
  prices?: NomenclaturePrice[]
}

type OrderItem = {
  localId: string
  nomenclatureId: number
  nomenclatureName: string
  unit?: number | null
  unitName?: string | null
  price: string
  quantity: string
}

function parseNumber(value: string) {
  const numberValue = Number(value.replace(',', '.'))
  return Number.isFinite(numberValue) ? numberValue : 0
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, '')
}

async function fetchJson<T>(
  path: string,
  token: string,
  params: Record<string, string | number | boolean> = {}
) {
  const url = new URL(`${API_BASE}/${path}/`)
  url.searchParams.set('token', token)
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value))
  })

  const response = await fetch(url.toString())
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.detail || `Ошибка ${response.status}`)
  }

  return data as T
}

async function fetchAll<T>(path: string, token: string) {
  const pageLimit = 200
  let offset = 0
  let collected: T[] = []

  while (true) {
    const page = await fetchJson<ApiListResponse<T>>(path, token, {
      limit: pageLimit,
      offset,
    })
    const chunk = page.result ?? []
    collected = [...collected, ...chunk]
    offset += pageLimit

    const reachedCount = page.count ? collected.length >= page.count : false
    if (chunk.length < pageLimit || reachedCount) {
      break
    }
  }

  return collected
}

function App() {
  const [token, setToken] = useState(() => window.localStorage.getItem('tablecrm_token') ?? '')
  const [isLoadingMeta, setIsLoadingMeta] = useState(false)
  const [metaLoaded, setMetaLoaded] = useState(false)
  const [submitState, setSubmitState] = useState<'idle' | 'create' | 'conduct'>('idle')
  const [errorText, setErrorText] = useState('')
  const [successText, setSuccessText] = useState('')
  const [serverAnswer, setServerAnswer] = useState('')

  const [contragents, setContragents] = useState<Contragent[]>([])
  const [phone, setPhone] = useState('')
  const [selectedContragentId, setSelectedContragentId] = useState('')
  const [isSearchingContragents, setIsSearchingContragents] = useState(false)
  /** idle — поиск не делали; empty — 0 результатов; found — есть клиенты */
  const [clientLookupResult, setClientLookupResult] = useState<
    'idle' | 'empty' | 'found'
  >('idle')
  /** idle — не искали; empty — 0 товаров; found — список не пуст */
  const [productLookupResult, setProductLookupResult] = useState<
    'idle' | 'empty' | 'found'
  >('idle')
  /** Модалка «ничего не найдено» — отдельно от inline-подсказок */
  const [emptySearchModal, setEmptySearchModal] = useState<
    null | 'client' | 'product'
  >(null)

  const [payboxes, setPayboxes] = useState<NamedEntity[]>([])
  const [organizations, setOrganizations] = useState<NamedEntity[]>([])
  const [warehouses, setWarehouses] = useState<NamedEntity[]>([])
  const [priceTypes, setPriceTypes] = useState<NamedEntity[]>([])

  const [selectedPayboxId, setSelectedPayboxId] = useState('')
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('')
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('')
  const [selectedPriceTypeId, setSelectedPriceTypeId] = useState('')

  const [productQuery, setProductQuery] = useState('')
  const [products, setProducts] = useState<Nomenclature[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [comment, setComment] = useState('')

  const totalSum = useMemo(
    () =>
      orderItems.reduce((sum, item) => {
        const quantity = parseNumber(item.quantity)
        const price = parseNumber(item.price)
        return sum + quantity * price
      }, 0),
    [orderItems]
  )

  const resetMessages = () => {
    setErrorText('')
    setSuccessText('')
    setServerAnswer('')
  }

  const loadMeta = async () => {
    if (!token.trim()) {
      setErrorText('Введите токен для загрузки справочников.')
      return
    }

    resetMessages()
    setIsLoadingMeta(true)
    try {
      const [payboxesData, organizationsData, warehousesData, priceTypesData] =
        await Promise.all([
          fetchAll<NamedEntity>('payboxes', token),
          fetchAll<NamedEntity>('organizations', token),
          fetchAll<NamedEntity>('warehouses', token),
          fetchAll<NamedEntity>('price_types', token),
        ])

      setPayboxes(payboxesData)
      setOrganizations(organizationsData)
      setWarehouses(warehousesData)
      setPriceTypes(priceTypesData)
      setMetaLoaded(true)
      window.localStorage.setItem('tablecrm_token', token)

      if (organizationsData.length && !selectedOrganizationId) {
        setSelectedOrganizationId(String(organizationsData[0].id))
      }
      if (priceTypesData.length && !selectedPriceTypeId) {
        setSelectedPriceTypeId(String(priceTypesData[0].id))
      }
      setSuccessText('Справочники успешно загружены.')
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Ошибка загрузки справочников.')
    } finally {
      setIsLoadingMeta(false)
    }
  }

  const searchContragentsByPhone = async () => {
    if (!token.trim()) {
      setErrorText('Сначала укажите токен.')
      return
    }
    const normalizedPhone = normalizePhone(phone)
    if (!normalizedPhone) {
      setContragents([])
      setSelectedContragentId('')
      return
    }
    if (normalizedPhone.length < 6) {
      setErrorText('Введите корректный номер телефона (минимум 6 цифр).')
      return
    }

    resetMessages()
    setIsSearchingContragents(true)
    try {
      const data = await fetchJson<ApiListResponse<Contragent>>('contragents', token, {
        phone: normalizedPhone,
        limit: 20,
      })
      const foundContragents = data.result ?? []
      setContragents(foundContragents)
      if (foundContragents.length > 0) {
        setSelectedContragentId(String(foundContragents[0].id))
        setClientLookupResult('found')
        setSuccessText(`Найдено клиентов: ${foundContragents.length}.`)
      } else {
        setSelectedContragentId('')
        setClientLookupResult('empty')
        setEmptySearchModal('client')
        setSuccessText('')
      }
    } catch (error) {
      setClientLookupResult('idle')
      setErrorText(error instanceof Error ? error.message : 'Ошибка поиска клиента.')
    } finally {
      setIsSearchingContragents(false)
    }
  }

  const searchProducts = async () => {
    if (!token.trim()) {
      setErrorText('Сначала укажите токен.')
      return
    }
    if (productQuery.trim().length < 2) {
      setProducts([])
      setProductLookupResult('idle')
      return
    }

    setProductsLoading(true)
    resetMessages()
    try {
      const data = await fetchJson<ApiListResponse<Nomenclature>>('nomenclature', token, {
        name: productQuery.trim(),
        with_prices: true,
        limit: 30,
      })
      const list = data.result ?? []
      setProducts(list)
      if (list.length === 0) {
        setProductLookupResult('empty')
        setEmptySearchModal('product')
      } else {
        setProductLookupResult('found')
      }
    } catch (error) {
      setProductLookupResult('idle')
      setErrorText(error instanceof Error ? error.message : 'Ошибка поиска товаров.')
    } finally {
      setProductsLoading(false)
    }
  }

  const resolveInitialPrice = (item: Nomenclature) => {
    const selectedPriceType = priceTypes.find(
      (priceType) => String(priceType.id) === selectedPriceTypeId
    )
    const price = (item.prices ?? []).find((candidate) => {
      if (!selectedPriceType) {
        return true
      }
      return (
        String(candidate.price_type) === String(selectedPriceType.id) ||
        String(candidate.price_type).toLowerCase() === String(selectedPriceType.name).toLowerCase()
      )
    })

    return String(price?.price ?? 0)
  }

  const addOrderItem = (item: Nomenclature) => {
    const alreadyAdded = orderItems.some((orderItem) => orderItem.nomenclatureId === item.id)
    if (alreadyAdded) {
      return
    }

    const newItem: OrderItem = {
      localId: crypto.randomUUID(),
      nomenclatureId: item.id,
      nomenclatureName: item.name,
      unit: item.unit,
      unitName: item.unit_name,
      price: resolveInitialPrice(item),
      quantity: '1',
    }
    setOrderItems((prev) => [...prev, newItem])
  }

  const updateOrderItem = (
    localId: string,
    field: 'price' | 'quantity',
    value: string
  ) => {
    setOrderItems((prev) =>
      prev.map((item) => (item.localId === localId ? { ...item, [field]: value } : item))
    )
  }

  const removeOrderItem = (localId: string) => {
    setOrderItems((prev) => prev.filter((item) => item.localId !== localId))
  }

  const submitSale = async (conduct: boolean) => {
    if (!token.trim()) {
      setErrorText('Введите токен.')
      return
    }
    if (!selectedOrganizationId) {
      setErrorText('Выберите организацию.')
      return
    }
    if (orderItems.length === 0) {
      setErrorText('Добавьте хотя бы один товар.')
      return
    }

    resetMessages()
    setSubmitState(conduct ? 'conduct' : 'create')

    const payload = [
      {
        operation: 'Заказ',
        organization: Number(selectedOrganizationId),
        warehouse: selectedWarehouseId ? Number(selectedWarehouseId) : undefined,
        paybox: selectedPayboxId ? Number(selectedPayboxId) : undefined,
        contragent: selectedContragentId ? Number(selectedContragentId) : undefined,
        status: conduct,
        comment: comment.trim() || undefined,
        goods: orderItems.map((item) => ({
          price_type: selectedPriceTypeId ? Number(selectedPriceTypeId) : undefined,
          price: parseNumber(item.price),
          quantity: parseNumber(item.quantity),
          nomenclature: item.nomenclatureId,
          nomenclature_name: item.nomenclatureName,
          unit: item.unit || undefined,
          unit_name: item.unitName || undefined,
        })),
      },
    ]

    try {
      const url = new URL(`${API_BASE}/docs_sales/`)
      url.searchParams.set('token', token)
      if (conduct) {
        url.searchParams.set('generate_out', 'true')
      }

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const responseData = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(responseData?.detail || `Ошибка ${response.status}`)
      }

      setSuccessText(
        conduct ? 'Продажа создана и проведена.' : 'Продажа успешно создана.'
      )
      setServerAnswer(JSON.stringify(responseData, null, 2))
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось создать продажу.')
    } finally {
      setSubmitState('idle')
    }
  }

  const touchInput =
    'min-h-11 py-2.5 text-base md:min-h-8 md:py-1 md:text-sm'
  const touchSelectTrigger =
    'min-h-11 w-full justify-between bg-background py-2.5 text-base shadow-sm data-[size=default]:h-auto md:min-h-8 md:py-2 md:text-sm'
  const dictionariesReady =
    payboxes.length > 0 &&
    organizations.length > 0 &&
    warehouses.length > 0 &&
    priceTypes.length > 0
  const findButtonClass =
    'min-h-11 shrink-0 border-input bg-background text-base shadow-sm transition-all hover:border-muted-foreground/35 hover:bg-muted hover:text-foreground hover:shadow active:scale-[0.99] sm:min-w-[7rem]'

  return (
    <>
      <main className="mx-auto min-h-dvh w-full max-w-lg px-4 pb-[calc(12rem+env(safe-area-inset-bottom,0px))] pt-4 sm:px-5 sm:pb-10">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">TableCRM Mobile Order</h1>
            <p className="text-sm text-muted-foreground">
              Форма создания заказа в формате webapp
            </p>
          </div>
          {metaLoaded ? (
            <Badge className="w-fit">API подключен</Badge>
          ) : (
            <Badge className="w-fit" variant="secondary">
              Не подключен
            </Badge>
          )}
        </div>

        <div className="space-y-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">1. Токен кассы</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="token">Токен</Label>
              <Input
                id="token"
                className={touchInput}
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Введите token"
                autoComplete="off"
                autoCapitalize="none"
              />
            </div>
            <Button
              className="min-h-11 w-full text-base"
              onClick={loadMeta}
              disabled={isLoadingMeta}
            >
              {isLoadingMeta ? 'Загрузка...' : 'Загрузить справочники'}
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">2. Клиент</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
              <Input
                className={`flex-1 ${touchInput}`}
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value)
                  setClientLookupResult('idle')
                }}
                placeholder="Телефон клиента"
                inputMode="tel"
                autoComplete="tel"
              />
              <Button
                className={findButtonClass}
                type="button"
                variant="outline"
                onClick={searchContragentsByPhone}
                disabled={isSearchingContragents}
              >
                {isSearchingContragents ? 'Поиск...' : 'Найти'}
              </Button>
            </div>

            {clientLookupResult === 'empty' && (
              <p
                className="text-center text-base font-semibold text-amber-800 dark:text-amber-200"
                role="status"
              >
                Не найдено
              </p>
            )}

            {clientLookupResult === 'found' && (
              <div
                className="rounded-lg border border-emerald-500/35 bg-emerald-500/[0.1] px-3 py-2.5 text-sm leading-snug text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-50"
                role="status"
              >
                Клиенты найдены — выберите нужного в списке ниже.
              </div>
            )}

            <Select
              value={selectedContragentId}
              onValueChange={(value) => setSelectedContragentId(value ?? '')}
            >
              <SelectTrigger
                className={touchSelectTrigger}
                disabled={contragents.length === 0}
              >
                <SelectValue placeholder="Выберите клиента" />
              </SelectTrigger>
              <SelectContent>
                {(contragents ?? []).map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.name} {item.phone ? `(${item.phone})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Сначала нажмите «Найти» по телефону, затем выберите клиента из списка.
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">3. Параметры продажи</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!dictionariesReady && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
                Справочники еще не загружены. Нажмите «Загрузить справочники» в блоке токена.
              </p>
            )}
            <div className="space-y-2">
              <Label>Счет</Label>
              <Select
                value={selectedPayboxId}
                onValueChange={(value) => setSelectedPayboxId(value ?? '')}
              >
                <SelectTrigger className={touchSelectTrigger} disabled={payboxes.length === 0}>
                  <SelectValue placeholder="Выберите счет" />
                </SelectTrigger>
                <SelectContent>
                  {payboxes.length > 0 ? (
                    payboxes.map((paybox) => (
                      <SelectItem key={paybox.id} value={String(paybox.id)}>
                        {paybox.name ?? `Счет ${paybox.id}`}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="__empty_paybox" disabled>
                      Нет доступных счетов
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Организация *</Label>
              <Select
                value={selectedOrganizationId}
                onValueChange={(value) => setSelectedOrganizationId(value ?? '')}
              >
                <SelectTrigger
                  className={touchSelectTrigger}
                  disabled={organizations.length === 0}
                >
                  <SelectValue placeholder="Выберите организацию" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.length > 0 ? (
                    organizations.map((organization) => (
                      <SelectItem key={organization.id} value={String(organization.id)}>
                        {organization.short_name || organization.name || `Организация ${organization.id}`}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="__empty_org" disabled>
                      Нет доступных организаций
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Склад</Label>
              <Select
                value={selectedWarehouseId}
                onValueChange={(value) => setSelectedWarehouseId(value ?? '')}
              >
                <SelectTrigger
                  className={touchSelectTrigger}
                  disabled={warehouses.length === 0}
                >
                  <SelectValue placeholder="Выберите склад" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.length > 0 ? (
                    warehouses.map((warehouse) => (
                      <SelectItem key={warehouse.id} value={String(warehouse.id)}>
                        {warehouse.name ?? `Склад ${warehouse.id}`}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="__empty_warehouse" disabled>
                      Нет доступных складов
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Тип цен</Label>
              <Select
                value={selectedPriceTypeId}
                onValueChange={(value) => setSelectedPriceTypeId(value ?? '')}
              >
                <SelectTrigger className={touchSelectTrigger} disabled={priceTypes.length === 0}>
                  <SelectValue placeholder="Выберите тип цен" />
                </SelectTrigger>
                <SelectContent>
                  {priceTypes.length > 0 ? (
                    priceTypes.map((priceType) => (
                      <SelectItem key={priceType.id} value={String(priceType.id)}>
                        {priceType.name ?? `Тип цен ${priceType.id}`}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="__empty_price_type" disabled>
                      Нет доступных типов цен
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Комментарий</Label>
              <Textarea
                className="min-h-[5.5rem] resize-y py-3 text-base md:text-sm"
                placeholder="Комментарий к заказу"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">4. Товары</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
              <Input
                className={`flex-1 ${touchInput}`}
                value={productQuery}
                onChange={(event) => {
                  setProductQuery(event.target.value)
                  setProductLookupResult('idle')
                }}
                placeholder="Поиск товара по названию"
                autoComplete="off"
              />
              <Button
                className={findButtonClass}
                type="button"
                variant="outline"
                onClick={searchProducts}
                disabled={productsLoading}
              >
                {productsLoading ? 'Поиск...' : 'Найти'}
              </Button>
            </div>

            {productLookupResult === 'empty' && (
              <p
                className="text-center text-base font-semibold text-amber-800 dark:text-amber-200"
                role="status"
              >
                Не найдено
              </p>
            )}

            {productLookupResult === 'found' && products.length > 0 && (
              <div
                className="rounded-lg border border-emerald-500/35 bg-emerald-500/[0.1] px-3 py-2.5 text-sm leading-snug text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-50"
                role="status"
              >
                Найдено товаров: {products.length}. Нажмите «Добавить» у нужных позиций.
              </div>
            )}

            {products.length > 0 && (
              <div className="space-y-2">
                {products.map((product) => (
                  <div
                    key={product.id}
                    className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-snug">{product.name}</p>
                      <p className="text-xs text-muted-foreground">ID: {product.id}</p>
                    </div>
                    <Button
                      className="min-h-11 w-full shrink-0 text-base sm:w-auto sm:min-w-[8rem]"
                      onClick={() => addOrderItem(product)}
                    >
                      Добавить
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {orderItems.length > 0 && (
              <div className="space-y-3">
                <Separator />
                {orderItems.map((item) => (
                  <div key={item.localId} className="rounded-lg border p-3">
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-medium leading-snug">{item.nomenclatureName}</p>
                        <p className="text-xs text-muted-foreground">ID: {item.nomenclatureId}</p>
                      </div>
                      <Button
                        className="min-h-10 w-full text-base sm:w-auto"
                        variant="destructive"
                        onClick={() => removeOrderItem(item.localId)}
                      >
                        Удалить
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-sm">Количество</Label>
                        <Input
                          className={touchInput}
                          inputMode="decimal"
                          value={item.quantity}
                          onChange={(event) =>
                            updateOrderItem(item.localId, 'quantity', event.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm">Цена</Label>
                        <Input
                          className={touchInput}
                          inputMode="decimal"
                          value={item.price}
                          onChange={(event) =>
                            updateOrderItem(item.localId, 'price', event.target.value)
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-dashed shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Итог</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Позиций: <span className="font-medium text-foreground">{orderItems.length}</span>
              {' · '}
              Сумма:{' '}
              <span className="font-semibold text-foreground">{totalSum.toFixed(2)} ₽</span>
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Отправка заказа — кнопки внизу экрана.
            </p>
          </CardContent>
        </Card>

        {errorText && (
          <Card className="border-destructive/40 shadow-sm">
            <CardContent className="pt-6 text-base text-destructive">{errorText}</CardContent>
          </Card>
        )}
        {successText && (
          <Card className="border-primary/40 shadow-sm">
            <CardContent className="space-y-2 pt-6 text-base">
              <p>{successText}</p>
              {serverAnswer && (
                <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed">
                  {serverAnswer}
                </pre>
              )}
            </CardContent>
          </Card>
        )}
        </div>
      </main>

      <footer
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 shadow-[0_-8px_32px_-12px_rgba(0,0,0,0.15)] backdrop-blur-md supports-[backdrop-filter]:bg-background/85"
        style={{
          paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div className="mx-auto max-w-lg px-4 pt-3 sm:px-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1 text-center text-sm">
            <span className="text-muted-foreground">Позиций:</span>
            <span className="font-semibold tabular-nums">{orderItems.length}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">Сумма</span>
            <span className="text-lg font-semibold tabular-nums tracking-tight">
              {totalSum.toFixed(2)} ₽
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <Button
              className="min-h-12 w-full text-base font-medium"
              onClick={() => submitSale(false)}
              disabled={submitState !== 'idle' || isLoadingMeta}
            >
              {submitState === 'create' ? 'Создание...' : 'Создать продажу'}
            </Button>
            <Button
              className="min-h-12 w-full text-base font-medium"
              onClick={() => submitSale(true)}
              disabled={submitState !== 'idle' || isLoadingMeta}
              variant="secondary"
            >
              {submitState === 'conduct' ? 'Отправка...' : 'Создать и провести'}
            </Button>
          </div>
        </div>
      </footer>

      <Dialog
        open={emptySearchModal !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEmptySearchModal(null)
          }
        }}
      >
        <DialogContent
          showCloseButton
          className="max-w-[min(100vw-1.5rem,22rem)] gap-0 overflow-hidden border-2 border-amber-400/70 bg-gradient-to-b from-amber-50 via-orange-50/95 to-amber-100/90 p-0 text-foreground shadow-2xl ring-amber-300/40 dark:border-amber-500/50 dark:from-amber-950/95 dark:via-zinc-900 dark:to-zinc-950 dark:ring-amber-700/30 sm:max-w-md"
        >
          <div className="flex flex-col items-center gap-1 px-5 pt-8 pb-4 text-center">
            <div
              className="flex size-14 items-center justify-center rounded-2xl bg-amber-400/25 text-amber-900 shadow-inner dark:bg-amber-500/20 dark:text-amber-100"
              aria-hidden
            >
              {emptySearchModal === 'client' ? (
                <UserX className="size-8 stroke-[1.75]" />
              ) : (
                <PackageSearch className="size-8 stroke-[1.75]" />
              )}
            </div>
            <DialogHeader className="gap-2 sm:gap-2">
              <DialogTitle className="text-balance text-lg font-semibold text-amber-950 dark:text-amber-50">
                {emptySearchModal === 'client'
                  ? 'Клиенты не найдены'
                  : 'Товары не найдены'}
              </DialogTitle>
              <DialogDescription className="text-balance text-base leading-relaxed text-amber-950/85 dark:text-amber-100/85">
                {emptySearchModal === 'client'
                  ? 'По введённому номеру в базе никого нет. Проверьте номер или продолжите без выбора клиента.'
                  : 'По этому запросу номенклатура не найдена. Измените поисковую строку или введите другое название.'}
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="border-t border-amber-300/40 bg-amber-200/25 px-4 py-4 dark:border-amber-700/40 dark:bg-amber-950/40">
            <Button
              type="button"
              className="min-h-11 w-full text-base font-medium"
              onClick={() => setEmptySearchModal(null)}
            >
              Понятно
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default App
