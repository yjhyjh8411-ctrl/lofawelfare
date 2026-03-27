'use server'
 
export async function handleSubmit(prevState: any, formData: FormData) {
  const applicantName = formData.get('applicantName')
  const employeeId = formData.get('employeeId')
  const benefitType = formData.get('benefitType')
  const amount = formData.get('amount')
  const reason = formData.get('reason')
 
  console.log('Received application:');
  console.log({
    applicantName,
    employeeId,
    benefitType,
    amount,
    reason,
  });
 
  // Simulate a database operation
  await new Promise(resolve => setTimeout(resolve, 1500));
 
  // In a real application, you would save this to a database.
  // For now, we'll just return a success message.
 
  return {
    message: `'${benefitType}' 항목 신청이 성공적으로 제출되었습니다.`,
  }
}
