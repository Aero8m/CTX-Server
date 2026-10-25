/* Generated from contracts/openapi.json; run npm run contracts. */

export type FieldUsername = string
export type FieldPassword = string
export type FieldCaptchaId = string | null
export type FieldCaptchaAnswer = string | null
export type FieldOldPassword = string
export type FieldNewPassword = string
export type FieldName = string
export type FieldName1 = string | null
export type FieldGroupId = string | null
export type FieldName2 = string
export type FieldGroupId1 = string | null
export type FieldName3 = string
export type FieldKind = 'profile' | 'display_config'
export type FieldKind1 = 'profile' | 'display_config'
export type FieldRevision = number
export type FieldName4 = string | null
export type FieldContent2 = {
  [k: string]: unknown
} | null
export type FieldArchived = boolean | null
export type FieldId = string
export type FieldRevision1 = number
/**
 * @minItems 1
 * @maxItems 2
 */
export type FieldResources = [ResourceRef, ...ResourceRef[]]
/**
 * @maxItems 1000
 */
export type FieldDeviceIds = string[]
/**
 * @maxItems 1000
 */
export type FieldGroupIds = string[]
export type FieldNote = string
/**
 * @maxItems 1000
 */
export type FieldDeviceIds1 = string[]
/**
 * @maxItems 1000
 */
export type FieldGroupIds1 = string[]
export type FieldNote1 = string
export type FieldCode = string
export type FieldClaimId = string
export type FieldDeviceSecret = string
export type FieldClientVersion = string
export type FieldGeneration = number
export type FieldVersionId = string | null
/**
 * @maxItems 10
 */
export type FieldProfile = number[]
/**
 * @maxItems 10
 */
export type FieldDisplayConfig = number[]
export type FieldClientVersion1 = string
export type FieldAssignmentId = string
export type FieldKind2 = 'profile' | 'display_config'
export type FieldGeneration1 = number
export type FieldVersionId1 = string
export type FieldAttempt = number
export type FieldResult = 'applied' | 'failed' | 'blocked'
export type FieldReason = string
export type FieldStarttime = string
export type FieldEndtime = string
export type FieldSubject = string
export type FieldDate = string
export type FieldSourceweekscheduleid = string
export type FieldSourceweekday = number
/**
 * @maxItems 1000
 */
export type FieldSourceclasses = Course[]
/**
 * @maxItems 1000
 */
export type FieldClasses = Course[]
export type FieldName5 = string
export type FieldEnableday = number
/**
 * @maxItems 1000
 */
export type FieldClasses1 = Course[]
export type FieldName6 = string
export type FieldSemesterstartdate = string | null
export type FieldName7 = string
export type FieldSimplifiedname = string
export type FieldTeacher = string
/**
 * @maxItems 1000
 */
export type FieldSubjects = Subject[]
export type FieldName8 = string
export type FieldStarttime1 = string
export type FieldEndtime1 = string
/**
 * @maxItems 1000
 */
export type FieldTimepoints = TimeRange[]
/**
 * @maxItems 100
 */
export type FieldTimelines = TimeLine[]
export type FieldName9 = string
export type FieldId1 = string
export type FieldMode = 'all' | 'odd' | 'even'
/**
 * @maxItems 7
 */
export type FieldDayschedules = DaySchedule[]
/**
 * @maxItems 100
 */
export type FieldSchedules = WeekSchedule[]
export type FieldActiveweekscheduleid = string
/**
 * @maxItems 1000
 */
export type FieldDateoverrides = DateOverride[]
export type FieldId2 = string
export type FieldName10 = string
export type FieldEnabled = boolean
export type FieldText = string
/**
 * @minItems 1
 * @maxItems 7
 */
export type FieldWeekdays = [number, ...number[]]
export type FieldCourse = number
export type FieldSubject1 = string
export type FieldPeriod = number
export type FieldTiming = number
export type FieldTime = string
export type FieldOffsetminutes = number
/**
 * @maxItems 1000
 */
export type FieldReminderrules = ReminderRule[]
export type FieldVersion = 1
export type FieldThemecolor = string
export type FieldThememode = 'system' | 'light' | 'dark'
export type FieldWindoweffect = 'normal' | 'elaMica' | 'mica' | 'micaAlt' | 'acrylic' | 'dwmBlur'
export type FieldTypeid = 'builtin/date' | 'builtin/courseView' | 'builtin/countdown' | 'builtin/textTip'
export type FieldInstanceid = string
export type FieldEnabled1 = boolean
export type FieldText1 = string | null
export type FieldCoursespacing = number | null
export type FieldEnable = boolean
export type FieldTargetdatetime = string
export type FieldLabeltag = string
export type FieldEnglishtag = string
export type FieldShowmilliseconds = boolean
export type FieldUselegacyplacement = boolean
export type FieldRightmargin = number
export type FieldBottommargin = number
export type FieldScalepercent = number
export type FieldEnable1 = boolean
export type FieldHeight = number
export type FieldComponentspacing = number
/**
 * @maxItems 32
 */
export type FieldComponents = Component[]
export type FieldSchemaVersion = 1
export type FieldId3 = string
export type FieldUsername1 = string
export type FieldCreatedAt = string
export type FieldId4 = string
export type FieldName11 = string
export type FieldCreatedAt1 = string
export type FieldKind3 = 'profile' | 'display_config'
export type FieldGeneration2 = number
export type FieldAssignmentId1 = string | null
export type FieldTargetVersionId = string | null
export type FieldAppliedVersionId = string | null
export type FieldAppliedGeneration = number
export type FieldAttempt1 = number
export type FieldStatus = 'pending' | 'applied' | 'failed' | 'blocked'
export type FieldReason1 = string
export type FieldId5 = string
export type FieldAssignmentId2 = string
export type FieldKind4 = 'profile' | 'display_config'
export type FieldGeneration3 = number
export type FieldVersionId2 = string
export type FieldAttempt2 = number
export type FieldResult1 = 'applied' | 'failed' | 'blocked'
export type FieldReason2 = string
export type FieldCreatedAt2 = string
export type FieldId6 = string
export type FieldName12 = string
export type FieldGroupId2 = string | null
export type FieldCreatedAt3 = string
export type FieldRevokedAt = string | null
export type FieldLastSeenAt = string | null
export type FieldClientVersion2 = string
export type FieldOnline = boolean
export type FieldChannels = ChannelView[]
export type FieldReceipts = ReceiptView[] | null
export type FieldId7 = string
export type FieldName13 = string
export type FieldKind5 = 'profile' | 'display_config'
export type FieldRevision2 = number
export type FieldArchived1 = boolean
export type FieldCreatedAt4 = string
export type FieldUpdatedAt = string
export type FieldContent3 = {
  [k: string]: unknown
} | null
export type FieldId8 = string
export type FieldResourceId = string
export type FieldKind6 = 'profile' | 'display_config'
export type FieldSha256 = string
export type FieldFormatVersion = number
export type FieldAssignmentId3 = string
export type FieldDeviceId = string
export type FieldDeviceName = string
export type FieldKind7 = 'profile' | 'display_config'
export type FieldGeneration4 = number
export type FieldVersionId3 = string
export type FieldSuperseded = boolean
export type FieldStatus1 = 'pending' | 'applied' | 'failed' | 'blocked'
export type FieldReason3 = string
export type FieldId9 = string
export type FieldCreatedAt5 = string
export type FieldNote2 = string
export type FieldRollbackOf = string | null
export type FieldVersions = VersionView[]
export type FieldTargetCount = number
export type FieldTargets = TargetView[] | null
export type FieldKind8 = 'profile' | 'display_config'
export type FieldGeneration5 = number
export type FieldAssignmentId4 = string | null
export type FieldTargetVersionId1 = string | null
export type FieldAppliedVersionId1 = string | null
export type FieldAppliedGeneration1 = number
export type FieldAttempt3 = number
export type FieldStatus2 = 'pending' | 'applied' | 'failed' | 'blocked'
export type FieldReason4 = string
export type FieldVersionId4 = string
export type FieldSha2561 = string
export type FieldFormatVersion1 = number
export type FieldCompatible = boolean
export type FieldDownloadUrl = string | null
export type FieldDeviceId1 = string
export type FieldServerTime = string
export type FieldSyncAfterSeconds = number
export type FieldId10 = string
export type FieldName14 = string
export type FieldKind9 = 'profile' | 'display_config'
export type FieldSha2562 = string
export type FieldPreviewToken = string
export type FieldDevices = PreviewDevice[]
export type FieldVersions1 = PreviewVersion[]
export type FieldCsrfToken = string
export type FieldWarnings = string[]
export type FieldReceiptId = string
export type FieldDuplicate = boolean
export type FieldId11 = string
export type FieldName15 = string
export type FieldGroupId3 = string | null
export type FieldExpiresAt = string
export type FieldRevokedAt1 = string | null
export type FieldDeviceId2 = string | null
export type FieldCreatedAt6 = string
export type FieldCode1 = string | null
export type FieldDeviceId3 = string
export type FieldName16 = string
export type FieldCsrfToken1 = string
export type FieldAuthenticated = boolean
export type FieldId12 = string
export type FieldImage = string
export type FieldExpiresAt1 = string
export type FieldWarnings1 = string[]
export type FieldSpecial = boolean | null
export type FieldScheduleId = string | null
export type FieldName17 = string | null
export type FieldError = string | null
export type FieldMatches = string[] | null
export type FieldClasses2 = {
  [k: string]: unknown
}[]
export type FieldStatus3 = 'ok' | 'ready'
export type FieldCode2 = string
export type FieldMessage = string
export type FieldDetails =
  | {
      [k: string]: unknown
    }
  | unknown[]
  | string
  | null
export type FieldRequestId = string
export type FieldItems = {
  [k: string]: unknown
}[]
export type FieldTotal = number
export type FieldPage = number
export type FieldPageSize = number

export interface WireContracts {
  Credentials?: Credentials
  PasswordChange?: PasswordChange
  Named?: Named
  DeviceEdit?: DeviceEdit
  PairCodeCreate?: PairCodeCreate
  ResourceCreate?: ResourceCreate
  ResourceValidate?: ResourceValidate
  ResourceEdit?: ResourceEdit
  ResourceRef?: ResourceRef
  ReleaseRequest?: ReleaseRequest
  RollbackRequest?: RollbackRequest
  PairClaim?: PairClaim
  LocalState?: LocalState
  SupportedFormats?: SupportedFormats
  SyncRequest?: SyncRequest
  ReceiptRequest?: ReceiptRequest
  Course?: Course
  DateOverride?: DateOverride
  DaySchedule?: DaySchedule
  Profile?: Profile
  ReminderRule?: ReminderRule
  Subject?: Subject
  TimeLine?: TimeLine
  TimeRange?: TimeRange
  WeekSchedule?: WeekSchedule
  NativeProfile?: NativeProfile
  Appearance?: Appearance
  Component?: Component
  Countdown?: Countdown
  CourseBar?: CourseBar
  DisplayConfig?: DisplayConfig
  AccountView?: AccountView
  GroupView?: GroupView
  ChannelView?: ChannelView
  ReceiptView?: ReceiptView
  DeviceView?: DeviceView
  ResourceView?: ResourceView
  VersionView?: VersionView
  TargetView?: TargetView
  ReleaseView?: ReleaseView
  SyncTarget?: SyncTarget
  SyncView?: SyncView
  PreviewDevice?: PreviewDevice
  PreviewVersion?: PreviewVersion
  PreviewView?: PreviewView
  LoginView?: LoginView
  ResourceSaveView?: ResourceSaveView
  ReceiptSavedView?: ReceiptSavedView
  PairingView?: PairingView
  PairResult?: PairResult
  CSRFView?: CSRFView
  CaptchaView?: CaptchaView
  ValidationView?: ValidationView
  DatePreviewView?: DatePreviewView
  HealthView?: HealthView
  ErrorDetail?: ErrorDetail
  ErrorView?: ErrorView
  Paged?: Paged
}
export interface Credentials {
  username: FieldUsername
  password: FieldPassword
  captcha_id?: FieldCaptchaId
  captcha_answer?: FieldCaptchaAnswer
}
export interface PasswordChange {
  old_password: FieldOldPassword
  new_password: FieldNewPassword
}
export interface Named {
  name: FieldName
}
export interface DeviceEdit {
  name?: FieldName1
  group_id?: FieldGroupId
}
export interface PairCodeCreate {
  name: FieldName2
  group_id?: FieldGroupId1
}
export interface ResourceCreate {
  name: FieldName3
  kind: FieldKind
  content: FieldContent
}
export interface FieldContent {
  [k: string]: unknown
}
export interface ResourceValidate {
  kind: FieldKind1
  content: FieldContent1
}
export interface FieldContent1 {
  [k: string]: unknown
}
export interface ResourceEdit {
  revision: FieldRevision
  name?: FieldName4
  content?: FieldContent2
  archived?: FieldArchived
}
export interface ResourceRef {
  id: FieldId
  revision: FieldRevision1
}
export interface ReleaseRequest {
  resources: FieldResources
  device_ids?: FieldDeviceIds
  group_ids?: FieldGroupIds
  note?: FieldNote
}
export interface RollbackRequest {
  device_ids?: FieldDeviceIds1
  group_ids?: FieldGroupIds1
  note?: FieldNote1
}
export interface PairClaim {
  code: FieldCode
  claim_id: FieldClaimId
  device_secret: FieldDeviceSecret
  client_version?: FieldClientVersion
}
export interface LocalState {
  generation: FieldGeneration
  version_id?: FieldVersionId
}
export interface SupportedFormats {
  profile?: FieldProfile
  display_config?: FieldDisplayConfig
}
export interface SyncRequest {
  client_version?: FieldClientVersion1
  supported_formats?: SupportedFormats
  applied?: FieldApplied
}
export interface FieldApplied {
  [k: string]: LocalState
}
export interface ReceiptRequest {
  assignment_id: FieldAssignmentId
  kind: FieldKind2
  generation: FieldGeneration1
  version_id: FieldVersionId1
  attempt: FieldAttempt
  result: FieldResult
  reason?: FieldReason
}
export interface Course {
  startTime: FieldStarttime
  endTime: FieldEndtime
  subject: FieldSubject
}
export interface DateOverride {
  date: FieldDate
  sourceWeekScheduleId: FieldSourceweekscheduleid
  sourceWeekday: FieldSourceweekday
  sourceClasses: FieldSourceclasses
  classes: FieldClasses
}
export interface DaySchedule {
  name: FieldName5
  enableDay: FieldEnableday
  classes: FieldClasses1
}
export interface Profile {
  name: FieldName6
  semesterStartDate?: FieldSemesterstartdate
  subjects: FieldSubjects
  timeLines: FieldTimelines
  schedules: FieldSchedules
  activeWeekScheduleId?: FieldActiveweekscheduleid
  dateOverrides?: FieldDateoverrides
  reminderRules?: FieldReminderrules
}
export interface Subject {
  name: FieldName7
  simplifiedName: FieldSimplifiedname
  teacher: FieldTeacher
}
export interface TimeLine {
  name: FieldName8
  timePoints: FieldTimepoints
}
export interface TimeRange {
  startTime: FieldStarttime1
  endTime: FieldEndtime1
}
export interface WeekSchedule {
  name: FieldName9
  id: FieldId1
  mode: FieldMode
  daySchedules: FieldDayschedules
}
export interface ReminderRule {
  id: FieldId2
  name: FieldName10
  enabled: FieldEnabled
  text: FieldText
  weekdays: FieldWeekdays
  course: FieldCourse
  subject: FieldSubject1
  period: FieldPeriod
  timing: FieldTiming
  time: FieldTime
  offsetMinutes: FieldOffsetminutes
}
export interface NativeProfile {
  version: FieldVersion
  profile: Profile
}
export interface Appearance {
  themeColor?: FieldThemecolor
  themeMode?: FieldThememode
  windowEffect?: FieldWindoweffect
}
export interface Component {
  typeId: FieldTypeid
  instanceId: FieldInstanceid
  enabled?: FieldEnabled1
  settings?: FieldSettings
  text?: FieldText1
  courseSpacing?: FieldCoursespacing
}
export interface FieldSettings {
  [k: string]: unknown
}
export interface Countdown {
  enable?: FieldEnable
  targetDateTime?: FieldTargetdatetime
  labelTag?: FieldLabeltag
  englishTag?: FieldEnglishtag
  showMilliseconds?: FieldShowmilliseconds
  useLegacyPlacement?: FieldUselegacyplacement
  rightMargin?: FieldRightmargin
  bottomMargin?: FieldBottommargin
  scalePercent?: FieldScalepercent
}
export interface CourseBar {
  enable?: FieldEnable1
  height?: FieldHeight
  componentSpacing?: FieldComponentspacing
  components: FieldComponents
}
export interface DisplayConfig {
  schema_version?: FieldSchemaVersion
  courseBarConfig: CourseBar
  appearanceConfig?: Appearance
  desktopCountdownConfig?: Countdown
}
export interface AccountView {
  id: FieldId3
  username: FieldUsername1
  created_at: FieldCreatedAt
}
export interface GroupView {
  id: FieldId4
  name: FieldName11
  created_at: FieldCreatedAt1
}
export interface ChannelView {
  kind: FieldKind3
  generation: FieldGeneration2
  assignment_id: FieldAssignmentId1
  target_version_id: FieldTargetVersionId
  applied_version_id: FieldAppliedVersionId
  applied_generation: FieldAppliedGeneration
  attempt: FieldAttempt1
  status: FieldStatus
  reason: FieldReason1
}
export interface ReceiptView {
  id: FieldId5
  assignment_id: FieldAssignmentId2
  kind: FieldKind4
  generation: FieldGeneration3
  version_id: FieldVersionId2
  attempt: FieldAttempt2
  result: FieldResult1
  reason: FieldReason2
  created_at: FieldCreatedAt2
}
export interface DeviceView {
  id: FieldId6
  name: FieldName12
  group_id: FieldGroupId2
  created_at: FieldCreatedAt3
  revoked_at: FieldRevokedAt
  last_seen_at: FieldLastSeenAt
  client_version: FieldClientVersion2
  online: FieldOnline
  channels: FieldChannels
  receipts?: FieldReceipts
}
export interface ResourceView {
  id: FieldId7
  name: FieldName13
  kind: FieldKind5
  revision: FieldRevision2
  archived: FieldArchived1
  created_at: FieldCreatedAt4
  updated_at: FieldUpdatedAt
  content?: FieldContent3
}
export interface VersionView {
  id: FieldId8
  resource_id: FieldResourceId
  kind: FieldKind6
  sha256: FieldSha256
  format_version: FieldFormatVersion
}
export interface TargetView {
  assignment_id: FieldAssignmentId3
  device_id: FieldDeviceId
  device_name: FieldDeviceName
  kind: FieldKind7
  generation: FieldGeneration4
  version_id: FieldVersionId3
  superseded: FieldSuperseded
  status: FieldStatus1
  reason: FieldReason3
}
export interface ReleaseView {
  id: FieldId9
  created_at: FieldCreatedAt5
  note: FieldNote2
  rollback_of: FieldRollbackOf
  versions: FieldVersions
  target_count: FieldTargetCount
  targets?: FieldTargets
}
export interface SyncTarget {
  kind: FieldKind8
  generation: FieldGeneration5
  assignment_id: FieldAssignmentId4
  target_version_id: FieldTargetVersionId1
  applied_version_id: FieldAppliedVersionId1
  applied_generation: FieldAppliedGeneration1
  attempt: FieldAttempt3
  status: FieldStatus2
  reason: FieldReason4
  version_id: FieldVersionId4
  sha256: FieldSha2561
  format_version: FieldFormatVersion1
  compatible: FieldCompatible
  download_url: FieldDownloadUrl
}
export interface SyncView {
  device_id: FieldDeviceId1
  server_time: FieldServerTime
  sync_after_seconds: FieldSyncAfterSeconds
  channels: FieldChannels1
}
export interface FieldChannels1 {
  [k: string]: SyncTarget | null
}
export interface PreviewDevice {
  id: FieldId10
  name: FieldName14
}
export interface PreviewVersion {
  kind: FieldKind9
  sha256: FieldSha2562
  content: FieldContent4
}
export interface FieldContent4 {
  [k: string]: unknown
}
export interface PreviewView {
  preview_token: FieldPreviewToken
  devices: FieldDevices
  versions: FieldVersions1
}
export interface LoginView {
  account: AccountView
  csrf_token: FieldCsrfToken
}
export interface ResourceSaveView {
  resource: ResourceView
  warnings: FieldWarnings
}
export interface ReceiptSavedView {
  receipt_id: FieldReceiptId
  duplicate: FieldDuplicate
}
export interface PairingView {
  id: FieldId11
  name: FieldName15
  group_id: FieldGroupId3
  expires_at: FieldExpiresAt
  revoked_at: FieldRevokedAt1
  device_id: FieldDeviceId2
  created_at: FieldCreatedAt6
  code?: FieldCode1
}
export interface PairResult {
  device_id: FieldDeviceId3
  name: FieldName16
}
export interface CSRFView {
  csrf_token: FieldCsrfToken1
  authenticated: FieldAuthenticated
}
export interface CaptchaView {
  id: FieldId12
  image: FieldImage
  expires_at: FieldExpiresAt1
}
export interface ValidationView {
  content: FieldContent5
  warnings: FieldWarnings1
}
export interface FieldContent5 {
  [k: string]: unknown
}
export interface DatePreviewView {
  special?: FieldSpecial
  schedule_id?: FieldScheduleId
  name?: FieldName17
  error?: FieldError
  matches?: FieldMatches
  classes: FieldClasses2
}
export interface HealthView {
  status: FieldStatus3
}
export interface ErrorDetail {
  code: FieldCode2
  message: FieldMessage
  details: FieldDetails
  request_id: FieldRequestId
}
export interface ErrorView {
  error: ErrorDetail
}
export interface Paged {
  items: FieldItems
  total: FieldTotal
  page: FieldPage
  page_size: FieldPageSize
}
