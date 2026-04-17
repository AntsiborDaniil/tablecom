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
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'

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
        setSuccessText(`Найдено клиентов: ${foundContragents.length}.`)
      } else {
        setSelectedContragentId('')
        setSuccessText('Клиенты по указанному телефону не найдены.')
      }
    } catch (error) {
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
      setProducts(data.result ?? [])
    } catch (error) {
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

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-3 py-4 sm:px-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">TableCRM Mobile Order</h1>
          <p className="text-sm text-muted-foreground">
            Форма создания заказа в формате webapp
          </p>
        </div>
        {metaLoaded ? <Badge>API подключен</Badge> : <Badge variant="secondary">Не подключен</Badge>}
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Токен кассы</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="token">Токен</Label>
              <Input
                id="token"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Введите token"
              />
            </div>
            <Button className="w-full" onClick={loadMeta} disabled={isLoadingMeta}>
              {isLoadingMeta ? 'Загрузка...' : 'Загрузить справочники'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Клиент</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="Телефон клиента"
              />
              <Button
                onClick={searchContragentsByPhone}
                variant="secondary"
                disabled={isSearchingContragents}
              >
                {isSearchingContragents ? 'Поиск...' : 'Найти'}
              </Button>
            </div>

            <Select
              value={selectedContragentId}
              onValueChange={(value) => setSelectedContragentId(value ?? '')}
            >
              <SelectTrigger className="w-full" disabled={contragents.length === 0}>
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
            <p className="text-xs text-muted-foreground">
              Сначала нажмите "Найти" по телефону, затем выберите клиента из списка.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Параметры продажи</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Счет</Label>
              <Select
                value={selectedPayboxId}
                onValueChange={(value) => setSelectedPayboxId(value ?? '')}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Выберите счет" />
                </SelectTrigger>
                <SelectContent>
                  {payboxes.map((paybox) => (
                    <SelectItem key={paybox.id} value={String(paybox.id)}>
                      {paybox.name ?? `Счет ${paybox.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Организация *</Label>
              <Select
                value={selectedOrganizationId}
                onValueChange={(value) => setSelectedOrganizationId(value ?? '')}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Выберите организацию" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((organization) => (
                    <SelectItem key={organization.id} value={String(organization.id)}>
                      {organization.short_name || organization.name || `Организация ${organization.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Склад</Label>
              <Select
                value={selectedWarehouseId}
                onValueChange={(value) => setSelectedWarehouseId(value ?? '')}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Выберите склад" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((warehouse) => (
                    <SelectItem key={warehouse.id} value={String(warehouse.id)}>
                      {warehouse.name ?? `Склад ${warehouse.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Тип цен</Label>
              <Select
                value={selectedPriceTypeId}
                onValueChange={(value) => setSelectedPriceTypeId(value ?? '')}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Выберите тип цен" />
                </SelectTrigger>
                <SelectContent>
                  {priceTypes.map((priceType) => (
                    <SelectItem key={priceType.id} value={String(priceType.id)}>
                      {priceType.name ?? `Тип цен ${priceType.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Комментарий</Label>
              <Textarea
                placeholder="Комментарий к заказу"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">4. Товары</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={productQuery}
                onChange={(event) => setProductQuery(event.target.value)}
                placeholder="Поиск товара по названию"
              />
              <Button onClick={searchProducts} variant="secondary">
                {productsLoading ? 'Поиск...' : 'Найти'}
              </Button>
            </div>

            {products.length > 0 && (
              <div className="space-y-2">
                {products.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between rounded-lg border p-2"
                  >
                    <div>
                      <p className="text-sm font-medium">{product.name}</p>
                      <p className="text-xs text-muted-foreground">ID: {product.id}</p>
                    </div>
                    <Button size="sm" onClick={() => addOrderItem(product)}>
                      Добавить
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {orderItems.length > 0 && (
              <div className="space-y-2">
                <Separator />
                {orderItems.map((item) => (
                  <div key={item.localId} className="rounded-lg border p-2">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{item.nomenclatureName}</p>
                        <p className="text-xs text-muted-foreground">ID: {item.nomenclatureId}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => removeOrderItem(item.localId)}
                      >
                        Удалить
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Количество</Label>
                        <Input
                          inputMode="decimal"
                          value={item.quantity}
                          onChange={(event) =>
                            updateOrderItem(item.localId, 'quantity', event.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Цена</Label>
                        <Input
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">5. Итог</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Позиции: {orderItems.length} • Сумма: {totalSum.toFixed(2)} руб.
            </p>
            <div className="grid grid-cols-1 gap-2">
              <Button
                onClick={() => submitSale(false)}
                disabled={submitState !== 'idle' || isLoadingMeta}
              >
                {submitState === 'create' ? 'Создание...' : 'Создать продажу'}
              </Button>
              <Button
                onClick={() => submitSale(true)}
                disabled={submitState !== 'idle' || isLoadingMeta}
                variant="secondary"
              >
                {submitState === 'conduct' ? 'Отправка...' : 'Создать и провести'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {errorText && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6 text-sm text-destructive">{errorText}</CardContent>
          </Card>
        )}
        {successText && (
          <Card className="border-primary/40">
            <CardContent className="space-y-2 pt-6 text-sm">
              <p>{successText}</p>
              {serverAnswer && (
                <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs">{serverAnswer}</pre>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  )
}

export default App
