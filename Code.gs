/**
 * 홍익_보강 경매 (Google Apps Script Backend)
 * 
 * 구글 스프레드시트 연동:
 * - Spreadsheet ID: 1LsST_QqLkRIDQNvbeXw5EeCncJCEEOqAsC2duSngOcM
 * - 보강내역 시트: 홍익-보강 알리미 공유 확정 DB
 * - 보강경매 시트: 미신청 보강 경매 DB
 */

// 기본 연결 구글 스프레드시트 ID
var DEFAULT_SPREADSHEET_ID = '1LsST_QqLkRIDQNvbeXw5EeCncJCEEOqAsC2duSngOcM';

function doGet(e) {
  var htmlOutput = HtmlService.createTemplateFromFile('index').evaluate();
  htmlOutput
    .setTitle('홍익 보강 경매 | 온라인 교무실')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
  return htmlOutput;
}

/**
 * 구글 스프레드시트 객체를 가져오거나 자동 생성/설정합니다.
 */
function getDbSpreadsheet() {
  var scriptProperties = PropertiesService.getScriptProperties();
  var ssId = scriptProperties.getProperty('SPREADSHEET_ID') || DEFAULT_SPREADSHEET_ID;
  var ss;

  if (ssId) {
    try {
      ss = SpreadsheetApp.openById(ssId);
    } catch (e) {
      ss = null;
    }
  }

  if (!ss) {
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch (e) {
      ss = null;
    }
  }

  if (!ss) {
    ss = SpreadsheetApp.create('보강알리미_DB');
    scriptProperties.setProperty('SPREADSHEET_ID', ss.getId());
  }

  // 1. '보강내역' 시트 확인 및 생성 (알리미 연동 DB)
  var mainSheet = ss.getSheetByName('보강내역');
  if (!mainSheet) {
    mainSheet = ss.insertSheet('보강내역');
  }
  if (mainSheet.getLastRow() === 0) {
    mainSheet.appendRow(['ID', '날짜', '교시', '교실', '보강교과', '원교사', '보강교사', '사유', '등록시각', '확인여부', '긴급여부']);
    mainSheet.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#006b67').setFontColor('#ffffff');
    mainSheet.setFrozenRows(1);
  }

  // 2. '보강경매' 시트 확인 및 생성 (미신청 사전 계획 보강 경매 DB)
  var auctionSheet = ss.getSheetByName('보강경매');
  if (!auctionSheet) {
    auctionSheet = ss.insertSheet('보강경매');
  }
  if (auctionSheet.getLastRow() === 0) {
    auctionSheet.appendRow(['ID', '날짜', '교시', '교실', '보강교과', '원교사', '사유', '등록시각']);
    auctionSheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#4f46e5').setFontColor('#ffffff');
    auctionSheet.setFrozenRows(1);
  }

  return {
    ss: ss,
    mainSheet: mainSheet,
    auctionSheet: auctionSheet
  };
}

/**
 * 날짜 객체 또는 문자열을 YYYY-MM-DD 포맷으로 변환하는 헬퍼 함수
 */
function formatDateString(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone() || 'Asia/Seoul', 'yyyy-MM-dd');
  }
  var str = String(val).trim();
  if (str.indexOf('GMT') !== -1 || str.indexOf('한국 표준시') !== -1 || str.indexOf('T') !== -1) {
    var d = new Date(str);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, Session.getScriptTimeZone() || 'Asia/Seoul', 'yyyy-MM-dd');
    }
  }
  var match = str.match(/^(\d{4})[-.\/]?(\d{2})[-.\/]?(\d{2})/);
  if (match) {
    return match[1] + '-' + match[2] + '-' + match[3];
  }
  return str;
}

/**
 * 보강 날짜 기준 전날 13:00 마감 Date 객체 계산
 */
function getDeadlineDate(dateStr) {
  var formatted = formatDateString(dateStr);
  var parts = formatted.split('-');
  if (parts.length !== 3) return null;
  var year = parseInt(parts[0], 10);
  var month = parseInt(parts[1], 10) - 1;
  var day = parseInt(parts[2], 10);
  
  // 보강 날짜 하루 전 13:00:00
  return new Date(year, month, day - 1, 13, 0, 0);
}

/**
 * 현재 보강 경매 목록을 조회합니다.
 * - 전날 13시 경과 항목: 비활성화 처리 (isClosed = true)
 * - 보강 날짜 지난 항목: '보강경매' 시트에서 자동 삭제
 */
function getAuctionRecords() {
  try {
    var db = getDbSpreadsheet();
    var sheet = db.auctionSheet;
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];

    var timeZone = Session.getScriptTimeZone() || 'Asia/Seoul';
    var now = new Date();
    var todayStr = Utilities.formatDate(now, timeZone, 'yyyy-MM-dd');

    var records = [];
    var rowsToDelete = [];

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[0]) continue; // ID 없는 행 스킵

      var rowDateStr = formatDateString(row[1]);

      // 1. 날짜가 지난 미신청 보강 목록은 자동 삭제 대상
      if (rowDateStr < todayStr) {
        rowsToDelete.push(i + 1); // 1-indexed row number
        continue;
      }

      // 2. 전날 13시 마감 여부 계산
      var deadline = getDeadlineDate(rowDateStr);
      var isClosed = false;
      if (deadline && now.getTime() >= deadline.getTime()) {
        isClosed = true;
      }

      records.push({
        id: String(row[0]),
        date: rowDateStr,
        period: String(row[2]),
        className: String(row[3]),
        subject: String(row[4] || ''),
        originalTeacher: String(row[5] || ''),
        reason: String(row[6] || ''),
        timestamp: row[7] ? String(row[7]) : '',
        isClosed: isClosed,
        deadlineText: deadline ? Utilities.formatDate(deadline, timeZone, 'MM/dd 13:00') : ''
      });
    }

    // 날짜 지난 항목 역순으로 자동 삭제
    if (rowsToDelete.length > 0) {
      for (var d = rowsToDelete.length - 1; d >= 0; d--) {
        sheet.deleteRow(rowsToDelete[d]);
      }
      SpreadsheetApp.flush();
    }

    // 날짜 asc, 교시 asc 정렬
    records.sort(function(a, b) {
      if (a.date !== b.date) {
        return a.date < b.date ? -1 : 1;
      }
      var pA = parseInt(a.period) || 0;
      var pB = parseInt(b.period) || 0;
      return pA - pB;
    });

    return records;
  } catch (err) {
    Logger.log('Error in getAuctionRecords: ' + err.toString());
    throw new Error('보강 경매 목록을 불러오는데 실패했습니다: ' + err.message);
  }
}

/**
 * 신규 보강 경매 항목을 등록합니다. (사전 계획 보강 전용)
 * 제한 조건:
 * - 당일 5교시 ~ 7교시 등록 불가 ('마감 시간이 초과되어 등록할 수 없습니다.')
 * - 익일(다음날) 1교시 ~ 4교시 등록 불가 ('마감 시간이 초과되어 등록할 수 없습니다.')
 */
function addAuctionRecord(record) {
  try {
    if (!record.date || !record.period || !record.className || !record.subject || !record.originalTeacher) {
      throw new Error('필수 입력 항목(날짜, 교시, 교실, 보강교과, 결강교사)이 누락되었습니다.');
    }

    var db = getDbSpreadsheet();
    var sheet = db.auctionSheet;

    var formattedDate = formatDateString(record.date);
    var now = new Date();
    var timeZone = Session.getScriptTimeZone() || 'Asia/Seoul';
    var todayStr = Utilities.formatDate(now, timeZone, 'yyyy-MM-dd');

    var tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    var tomorrowStr = Utilities.formatDate(tomorrow, timeZone, 'yyyy-MM-dd');

    // 교시 숫자 추출
    var periodNum = parseInt(String(record.period).replace(/[^0-9]/g, ''), 10) || 0;

    // 이미 지난 날짜 등록 방지
    if (formattedDate < todayStr) {
      throw new Error('이미 지난 날짜의 수업은 경매로 등록할 수 없습니다.');
    }

    // 1. 당일 5교시 ~ 7교시 등록 제한
    if (formattedDate === todayStr && periodNum >= 5) {
      throw new Error('마감 시간이 초과되어 등록할 수 없습니다.');
    }

    // 2. 익일(다음날) 1교시 ~ 4교시 등록 제한
    if (formattedDate === tomorrowStr && periodNum >= 1 && periodNum <= 4) {
      throw new Error('마감 시간이 초과되어 등록할 수 없습니다.');
    }

    var newId = 'AUC-' + now.getTime() + '-' + Math.floor(Math.random() * 1000);
    var nowIso = now.toISOString();

    sheet.appendRow([
      newId,
      formattedDate,
      record.period,
      record.className,
      record.subject,
      record.originalTeacher,
      record.reason || '',
      nowIso
    ]);

    SpreadsheetApp.flush();

    return {
      success: true,
      id: newId,
      message: '보강 경매 수업이 성공적으로 등록되었습니다.'
    };
  } catch (err) {
    Logger.log('Error in addAuctionRecord: ' + err.toString());
    return {
      success: false,
      message: err.message || '등록 중 오류가 발생했습니다.'
    };
  }
}

/**
 * 보강 경매를 신청(체결)합니다.
 * - 보강교사(본인 이름) 작성 후 제출
 * - '보강내역' 시트로 자동 반영 (확인여부는 기본 true: 본인 확인 완료)
 * - '보강경매' 시트에서 삭제
 */
function claimAuctionRecord(auctionId, substituteTeacher) {
  try {
    if (!auctionId || !substituteTeacher || String(substituteTeacher).trim() === '') {
      throw new Error('보강 신청 교사 성명을 정확히 입력해주세요.');
    }

    var db = getDbSpreadsheet();
    var auctionSheet = db.auctionSheet;
    var mainSheet = db.mainSheet;

    var data = auctionSheet.getDataRange().getValues();
    var foundIndex = -1;
    var targetRow = null;

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(auctionId)) {
        foundIndex = i + 1; // 1-indexed
        targetRow = data[i];
        break;
      }
    }

    if (foundIndex === -1 || !targetRow) {
      return { success: false, message: '해당 경매 항목이 이미 완료되었거나 찾을 수 없습니다.' };
    }

    var dateStr = formatDateString(targetRow[1]);
    var now = new Date();

    // 1. 전날 13시 경과 검사
    var deadline = getDeadlineDate(dateStr);
    if (deadline && now.getTime() >= deadline.getTime()) {
      return { success: false, message: '해당 경매는 전날 13시가 지나 신청이 마감되었습니다.' };
    }

    // 2. 보강내역 시트로 전송 (체결 - 확인여부 true 기본 세팅)
    var subId = 'SUB-' + now.getTime() + '-' + Math.floor(Math.random() * 1000);
    var period = String(targetRow[2]);
    var className = String(targetRow[3]);
    var subject = String(targetRow[4] || '');
    var originalTeacher = String(targetRow[5] || '');
    var reason = String(targetRow[6] || '');
    var nowIso = now.toISOString();

    mainSheet.appendRow([
      subId,
      dateStr,
      period,
      className,
      subject,
      originalTeacher,
      String(substituteTeacher).trim(),
      reason,
      nowIso,
      true,  // 확인여부 기본 true (보강 경매 신청 건은 본인 확인 자동 세팅)
      false  // 긴급여부 false
    ]);

    // 3. 보강경매 시트에서 삭제
    auctionSheet.deleteRow(foundIndex);
    SpreadsheetApp.flush();

    return {
      success: true,
      message: '보강 신청이 완료되었습니다! (보강 알리미 본인 확인 완료 처리)'
    };
  } catch (err) {
    Logger.log('Error in claimAuctionRecord: ' + err.toString());
    return {
      success: false,
      message: err.message || '신청 처리 중 오류가 발생했습니다.'
    };
  }
}

/**
 * 등록자가 경매 항목을 취소/삭제합니다.
 */
function deleteAuctionRecord(auctionId) {
  try {
    var db = getDbSpreadsheet();
    var sheet = db.auctionSheet;
    var data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(auctionId)) {
        sheet.deleteRow(i + 1);
        SpreadsheetApp.flush();
        return { success: true, message: '보강 경매 등록이 취소/삭제되었습니다.' };
      }
    }
    return { success: false, message: '해당 경매 항목을 찾을 수 없습니다.' };
  } catch (err) {
    Logger.log('Error in deleteAuctionRecord: ' + err.toString());
    return { success: false, message: err.message };
  }
}

/**
 * 이미 확정된 전체 보강내역 조회 API (홍익-보강 알리미 연동 확인용)
 */
function getConfirmedRecords() {
  try {
    var db = getDbSpreadsheet();
    var sheet = db.mainSheet;
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];

    var records = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[0]) continue;

      records.push({
        id: String(row[0]),
        date: formatDateString(row[1]),
        period: String(row[2]),
        className: String(row[3]),
        subject: String(row[4] || ''),
        originalTeacher: String(row[5] || ''),
        substituteTeacher: String(row[6] || ''),
        reason: String(row[7] || ''),
        timestamp: row[8] ? String(row[8]) : '',
        confirmed: (row[9] === true || String(row[9]).toLowerCase() === 'true'),
        urgent: (row[10] === true || String(row[10]).toLowerCase() === 'true')
      });
    }

    records.sort(function(a, b) {
      if (a.date !== b.date) {
        return a.date > b.date ? -1 : 1;
      }
      var pA = parseInt(a.period) || 0;
      var pB = parseInt(b.period) || 0;
      return pA - pB;
    });

    return records;
  } catch (err) {
    Logger.log('Error in getConfirmedRecords: ' + err.toString());
    return [];
  }
}

/**
 * 자동 정리 트리거 함수 (Apps Script 시간 기반 트리거용)
 */
function autoCleanupAuctions() {
  Logger.log('Running autoCleanupAuctions...');
  getAuctionRecords();
}
