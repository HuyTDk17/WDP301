// Danh sách ngân hàng phổ biến + mã BIN theo chuẩn Napas — bắt buộc để sinh mã QR
// VietQR khi khách chuyển khoản cho chủ sân. Ngân hàng không có trong danh sách:
// chủ sân chọn "Ngân hàng khác" rồi nhập tay tên + mã BIN.
// Nguồn đối chiếu đầy đủ: https://api.vietqr.io/v2/banks
export const VN_BANKS = [
  { bin: '970436', name: 'Vietcombank (VCB)' },
  { bin: '970415', name: 'VietinBank (CTG)' },
  { bin: '970418', name: 'BIDV' },
  { bin: '970405', name: 'Agribank' },
  { bin: '970407', name: 'Techcombank (TCB)' },
  { bin: '970422', name: 'MB Bank (MB)' },
  { bin: '970416', name: 'ACB' },
  { bin: '970432', name: 'VPBank' },
  { bin: '970423', name: 'TPBank' },
  { bin: '970403', name: 'Sacombank' },
  { bin: '970437', name: 'HDBank' },
  { bin: '970441', name: 'VIB' },
  { bin: '970443', name: 'SHB' },
  { bin: '970448', name: 'OCB' },
  { bin: '970426', name: 'MSB' },
  { bin: '970440', name: 'SeABank' },
  { bin: '970431', name: 'Eximbank' },
  { bin: '970449', name: 'LPBank' },
  { bin: '970428', name: 'Nam A Bank' },
  { bin: '970409', name: 'Bac A Bank' },
  { bin: '970425', name: 'ABBANK' },
  { bin: '970412', name: 'PVcomBank' },
  { bin: '970429', name: 'SCB' },
  { bin: '970419', name: 'NCB' },
  { bin: '970438', name: 'BaoViet Bank' },
  { bin: '970406', name: 'DongA Bank' },
  { bin: '970452', name: 'KienlongBank' },
]

export const findBankByBin = (bin) => VN_BANKS.find((b) => b.bin === String(bin || ''))
